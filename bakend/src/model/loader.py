import hashlib
import io
import json
import time
from pathlib import Path
from threading import Lock

import numpy as np
import tensorflow as tf

from ..config import BASE


class ModelLoader:
    HEAD_SHA256 = '96e499cc1b3dbab36fd5f749fa5290c95d1c1384562b36a722d8dd4afbf20628'

    def __init__(self, model_path):
        self.model_path = Path(model_path)
        self.model = None
        self.lock = Lock()
        metadata = json.loads((BASE.parent / 'Modelo/metadata.json').read_text(encoding='utf-8'))
        self.classes = metadata['labels']
        self.input_shape = (224, 224, 3)
        if self.classes != ['APTO', 'NO APTO', 'SIN PLÁTANO']:
            raise ValueError('Unexpected model labels')

    def _load_head_weights(self):
        parts_dir = BASE / 'model' / 'three_class_head'
        parts = sorted(parts_dir.glob('part-*.bin'))
        if len(parts) != 20:
            raise ValueError('Incomplete three-class model head')
        payload = b''.join(part.read_bytes() for part in parts)
        if hashlib.sha256(payload).hexdigest() != self.HEAD_SHA256:
            raise ValueError('Invalid three-class model head')
        with np.load(io.BytesIO(payload), allow_pickle=False) as archive:
            w1 = np.asarray(archive['dense1_kernel'], dtype=np.float32)
            b1 = np.asarray(archive['dense1_bias'], dtype=np.float32)
            w2 = np.asarray(archive['dense2_kernel'], dtype=np.float32)
        if w1.shape != (1280, 100) or b1.shape != (100,) or w2.shape != (100, 3):
            raise ValueError('Invalid three-class head dimensions')
        return w1, b1, w2

    def load(self):
        if self.model is None:
            # The Teachable Machine backbone is identical to the previous export
            # (410,208 frozen parameters). Reuse it and attach the newly trained
            # three-class head supplied by the user's Keras export.
            legacy = tf.keras.models.load_model(self.model_path, compile=False, safe_mode=True)
            feature_layers = [
                layer for layer in legacy.layers
                if getattr(layer, 'count_params', lambda: 0)() == 410208
            ]
            if len(feature_layers) != 1:
                raise ValueError('Could not identify the Teachable Machine backbone')
            feature = feature_layers[0]
            feature.trainable = False

            inputs = tf.keras.Input(shape=self.input_shape, name='banana_image')
            features = feature(inputs, training=False)
            dense1 = tf.keras.layers.Dense(100, activation='relu', name='banana_dense1')
            dense2 = tf.keras.layers.Dense(3, activation='softmax', use_bias=False, name='banana_dense2')
            outputs = dense2(dense1(features))
            self.model = tf.keras.Model(inputs, outputs, name='BananaVision_3_classes')

            w1, b1, w2 = self._load_head_weights()
            dense1.set_weights([w1, b1])
            dense2.set_weights([w2])

            if tuple(self.model.input_shape[1:]) != self.input_shape or self.model.output_shape[-1] != 3:
                raise ValueError('Incompatible model dimensions')
            if self.model.count_params() != 538608:
                raise ValueError('Unexpected model parameter count')
            self.predict(np.zeros((1, *self.input_shape), np.float32))
        return self

    def predict(self, array):
        with self.lock:
            start = time.perf_counter()
            p = np.asarray(self.model(array, training=False), dtype=np.float64).reshape(-1)
            elapsed = (time.perf_counter() - start) * 1000
        if p.shape != (3,) or not np.isfinite(p).all() or (p < 0).any() or (p > 1).any() or not np.isclose(p.sum(), 1, atol=1e-4):
            raise ValueError('Invalid model probabilities')
        idx = int(p.argmax())
        return self.classes[idx], float(p[idx]), elapsed, dict(zip(self.classes, map(float, p)))

    def get_info(self):
        return {
            'input_shape': list(self.input_shape),
            'classes': self.classes,
            'model_name': 'BananaVision AI · 3 clases',
            'parameters': self.model.count_params(),
            'preprocessing': 'EXIF orientation, center crop, RGB, x / 127.5 - 1',
            'validation_status': 'No independent test dataset provided',
        }
