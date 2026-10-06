import io
import warnings
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from ..config import settings

class InvalidImage(ValueError):
    pass

def load_pil_from_bytes(data):
    if not data:
        raise InvalidImage('El archivo está vacío.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise InvalidImage('Utiliza una imagen JPG, PNG o WebP.')
                if image.width * image.height > settings.MAX_IMAGE_PIXELS:
                    raise InvalidImage('La imagen supera el límite de píxeles.')
                image.load()
                oriented = ImageOps.exif_transpose(image)
                if oriented.mode in ('RGBA', 'LA') or 'transparency' in oriented.info:
                    rgba = oriented.convert('RGBA')
                    background = Image.new('RGBA', rgba.size, 'white')
                    oriented = Image.alpha_composite(background, rgba)
                return oriented.convert('RGB')
    except InvalidImage:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise InvalidImage('No se pudo leer la imagen. Verifica que el archivo sea válido.') from exc

def preprocess_image_pil(image, target_size=(224, 224)):
    image = ImageOps.fit(image.convert('RGB'), target_size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    return (np.asarray(image, dtype=np.float32) / 127.5 - 1.0)[None, ...]
