from io import BytesIO
import numpy as np
import pytest
from PIL import Image

from src.config import BASE
from src.model.loader import ModelLoader
from src.model.preprocessing import preprocess_image_pil, load_pil_from_bytes, InvalidImage


def test_normalization_and_crop():
    black = preprocess_image_pil(Image.new('RGB', (300, 200), 'black'))
    white = preprocess_image_pil(Image.new('RGB', (300, 200), 'white'))
    assert black.dtype == np.float32 and black.shape == (1, 224, 224, 3)
    assert np.all(black == -1) and np.all(white == 1)
    image = Image.new('RGB', (400, 200), 'blue')
    image.paste(Image.new('RGB', (200, 200), 'red'), (100, 0))
    arr = preprocess_image_pil(image)
    assert np.all(arr[:, :, 3:-3, 0] == 1) and np.all(arr[:, :, 3:-3, 2] == -1)


def test_exif_orientation_and_transparency():
    image = Image.new('RGB', (40, 20), 'red')
    exif = Image.Exif(); exif[274] = 6
    raw = BytesIO(); image.save(raw, format='JPEG', exif=exif)
    assert load_pil_from_bytes(raw.getvalue()).size == (20, 40)
    raw = BytesIO(); Image.new('RGBA', (10, 10), (255, 0, 0, 0)).save(raw, format='PNG')
    assert load_pil_from_bytes(raw.getvalue()).getpixel((0, 0)) == (255, 255, 255)
    raw = BytesIO(); Image.new('RGB', (10, 10), 'red').save(raw, format='GIF')
    with pytest.raises(InvalidImage): load_pil_from_bytes(raw.getvalue())


def test_three_class_model_head_and_predictions():
    loader = ModelLoader(BASE / 'model/banana.keras').load()
    assert loader.classes == ['APTO', 'NO APTO', 'SIN PLÁTANO']
    assert loader.model.input_shape == (None, 224, 224, 3)
    assert loader.model.output_shape == (None, 3)
    assert loader.model.count_params() == 538608
    w1, b1, w2 = loader._load_head_weights()
    assert w1.shape == (1280, 100)
    assert b1.shape == (100,)
    assert w2.shape == (100, 3)
    label, confidence, _, probabilities = loader.predict(np.zeros((1, 224, 224, 3), np.float32))
    assert label in loader.classes
    assert confidence == max(probabilities.values())
    assert set(probabilities) == set(loader.classes)
    assert sum(probabilities.values()) == pytest.approx(1, abs=1e-4)


def test_invalid_model_output():
    loader = ModelLoader(BASE / 'model/banana.keras')
    for values in [[float('nan'), .3, .7], [2., -1., 0.], [.2, .2, .2], [1., 0.]]:
        loader.model = lambda x, training=False, v=values: np.array([v])
        with pytest.raises(ValueError):
            loader.predict(np.zeros((1, 224, 224, 3), np.float32))
