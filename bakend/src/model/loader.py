import json
import time
from threading import Lock
import numpy as np
import tensorflow as tf
from ..config import BASE

class ModelLoader:
    def __init__(self, model_path):
        self.model_path = model_path
        self.model = None
        self.lock = Lock()
        metadata = json.loads((BASE.parent / 'Modelo/metadata.json').read_text())
        self.classes = metadata['labels']
        self.input_shape = (224, 224, 3)
        if self.classes != ['NO APTO', 'APTO']:
            raise ValueError('Unexpected model labels')
    def load(self):
        if self.model is None:
            self.model = tf.keras.models.load_model(self.model_path, compile=False, safe_mode=True)
            if tuple(self.model.input_shape[1:]) != self.input_shape or self.model.output_shape[-1] != len(self.classes):
                raise ValueError('Incompatible model dimensions')
            self.predict(np.zeros((1, *self.input_shape), np.float32))
        return self
    def predict(self, array):
        with self.lock:
            start = time.perf_counter()
            p = np.asarray(self.model(array, training=False), dtype=np.float64).reshape(-1)
            elapsed = (time.perf_counter() - start) * 1000
        if p.shape != (2,) or not np.isfinite(p).all() or (p < 0).any() or (p > 1).any() or not np.isclose(p.sum(), 1, atol=1e-4):
            raise ValueError('Invalid model probabilities')
        idx = int(p.argmax())
        return self.classes[idx], float(p[idx]), elapsed, dict(zip(self.classes, map(float, p)))
    def get_info(self):
        return {'input_shape': list(self.input_shape), 'classes': self.classes,
                'model_name': 'MobileNetV2 · Teachable Machine', 'parameters': self.model.count_params(),
                'preprocessing': 'EXIF orientation, center crop, RGB, x / 127.5 - 1',
                'validation_status': 'No independent test dataset provided'}
