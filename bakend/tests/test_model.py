from pathlib import Path
from io import BytesIO
import numpy as np
import pytest
from PIL import Image
from src.config import BASE
from src.model.loader import ModelLoader
from src.model.preprocessing import preprocess_image_pil,load_pil_from_bytes,InvalidImage
from src.model.tfjs_import import import_tfjs

def test_normalization_and_crop():
    black=preprocess_image_pil(Image.new('RGB',(300,200),'black'))
    white=preprocess_image_pil(Image.new('RGB',(300,200),'white'))
    assert black.dtype==np.float32 and black.shape==(1,224,224,3)
    assert np.all(black==-1) and np.all(white==1)
    # Red central square, blue sidebands: center crop must remain red.
    image=Image.new('RGB',(400,200),'blue')
    image.paste(Image.new('RGB',(200,200),'red'),(100,0))
    arr=preprocess_image_pil(image)
    # Lanczos can blend the two border pixels; the interior stays red.
    assert np.all(arr[:, :, 3:-3, 0]==1) and np.all(arr[:, :, 3:-3, 2]==-1)

def test_exif_orientation_and_transparency():
    image=Image.new('RGB',(40,20),'red'); exif=Image.Exif();exif[274]=6
    raw=BytesIO();image.save(raw,format='JPEG',exif=exif)
    assert load_pil_from_bytes(raw.getvalue()).size==(20,40)
    raw=BytesIO();Image.new('RGBA',(10,10),(255,0,0,0)).save(raw,format='PNG')
    assert load_pil_from_bytes(raw.getvalue()).getpixel((0,0))==(255,255,255)
    raw=BytesIO();Image.new('RGB',(10,10),'red').save(raw,format='GIF')
    with pytest.raises(InvalidImage):load_pil_from_bytes(raw.getvalue())

def test_rebuilt_model_weights_and_predictions():
    source=import_tfjs(BASE.parent/'Modelo/model.json')
    saved=ModelLoader(BASE/'model/banana.keras').load()
    assert source.count_params()==saved.model.count_params()==538508
    for original,restored in zip(source.weights,saved.model.weights):
        np.testing.assert_array_equal(original.numpy(),restored.numpy())
    rng=np.random.default_rng(42)
    for sample in [np.zeros((1,224,224,3),np.float32),rng.uniform(-1,1,(1,224,224,3)).astype(np.float32)]:
        np.testing.assert_allclose(source(sample,training=False).numpy(),saved.model(sample,training=False).numpy(),atol=1e-6)

def test_invalid_model_output():
    loader=ModelLoader(BASE/'model/banana.keras')
    for values in [[float('nan'),.5],[2.,-1.],[.2,.2],[1.]]:
        loader.model=lambda x,training=False:np.array([values])
        with pytest.raises(ValueError):loader.predict(np.zeros((1,224,224,3),np.float32))
