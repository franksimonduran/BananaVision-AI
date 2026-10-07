import base64
import binascii
import logging
from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import ValidationError
from .schemas import Base64Input, PredictResponse, ModelInfo
from ..config import settings
from ..model.preprocessing import load_pil_from_bytes, preprocess_image_pil, InvalidImage
from ..services.recommendations import get_recommendation
from ..cloud import service as get_cloud_service

router = APIRouter()
logger = logging.getLogger(__name__)

def get_loader(request: Request):
    loader = getattr(request.app.state, 'loader', None)
    if loader is None:
        raise HTTPException(503, 'El modelo no está disponible. Revisa el registro del servidor.')
    return loader

@router.get('/health')
def health(request: Request):
    loaded = getattr(request.app.state, 'loader', None) is not None
    content = {'status': 'ok' if loaded else 'unavailable', 'model_loaded': loaded,
               'limits': {'image_mb': settings.MAX_IMAGE_SIZE_MB, 'batch_files': settings.MAX_BATCH_FILES,
                          'batch_mb': settings.MAX_BATCH_SIZE_MB}, 'threshold': settings.CONFIDENCE_THRESHOLD}
    cloud_configured = bool(__import__('os').environ.get('DATABASE_URL'))
    cloud_ready = getattr(request.app.state, 'cloud', None) is not None
    content['cloud_enabled'] = cloud_ready
    healthy = loaded and (not cloud_configured or cloud_ready)
    return JSONResponse(content, status_code=200 if healthy else 503)

@router.get('/model/info', response_model=ModelInfo)
def model_info(loader=Depends(get_loader)):
    return loader.get_info()

def check_size(data):
    if len(data) > settings.MAX_IMAGE_SIZE_MB * 1024**2:
        raise HTTPException(413, f'Cada imagen debe pesar como máximo {settings.MAX_IMAGE_SIZE_MB} MB.')
    if not data:
        raise HTTPException(400, 'El archivo está vacío.')
    return data

async def read_upload(file):
    if not isinstance(file, UploadFile) and not hasattr(file, 'read'):
        raise HTTPException(400, 'Debes enviar un archivo de imagen.')
    if file.content_type not in {'image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'}:
        raise HTTPException(415, 'Utiliza una imagen JPG, PNG o WebP.')
    return check_size(await file.read(settings.MAX_IMAGE_SIZE_MB * 1024**2 + 1))

def prepare(data):
    try:
        return preprocess_image_pil(load_pil_from_bytes(data))
    except InvalidImage as exc:
        raise HTTPException(400, str(exc)) from exc

def infer(array, loader):
    try:
        predicted, confidence, elapsed, probabilities = loader.predict(array)
        conclusive = confidence >= settings.CONFIDENCE_THRESHOLD
        label = predicted if conclusive else 'NO CONCLUYENTE'
        return PredictResponse(label=label, predicted_class=predicted, confidence=confidence,
                               probabilities=probabilities, conclusive=conclusive,
                               threshold=settings.CONFIDENCE_THRESHOLD,
                               recommendation=get_recommendation(label), inference_time_ms=elapsed)
    except Exception as exc:
        logger.exception('Inference failed')
        raise HTTPException(500, 'No se pudo ejecutar el modelo. Revisa el registro del servidor.') from exc


async def persist_if_requested(request: Request, result: PredictResponse, raw: bytes, name: str):
    mode = request.query_params.get("persist")
    if mode is None:
        return result
    if mode not in {"analysis", "rejection"}:
        raise HTTPException(400, "Modo de guardado inválido.")
    svc = get_cloud_service(request)
    account = svc.account(request.cookies.get("bv_session"))
    if account is None:
        raise HTTPException(401, "Inicia sesión para guardar los resultados en la nube.")
    if mode == "rejection" and result.label != "NO APTO":
        return result
    try:
        stored_id = await run_in_threadpool(svc.store, account.id, mode, raw, name, result)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Persistent result save failed")
        raise HTTPException(503, "No se pudo guardar el resultado en la nube. Vuelve a intentar.") from exc
    if mode == "analysis":
        result.record_id = stored_id
    else:
        result.capture_id = stored_id
    return result

PREDICT_DOC = {'requestBody': {'required': True, 'content': {
    'application/json': {'schema': {'type': 'object', 'required': ['image'], 'properties': {'image': {'type': 'string', 'description': 'Base64 o data URL'}}}},
    'multipart/form-data': {'schema': {'type': 'object', 'required': ['file'], 'properties': {'file': {'type': 'string', 'format': 'binary'}}}}}}}

@router.post('/predict', response_model=PredictResponse, openapi_extra=PREDICT_DOC)
async def predict(request: Request, loader=Depends(get_loader)):
    kind = request.headers.get('content-type', '').split(';')[0].strip().lower()
    if kind == 'application/json':
        try:
            payload = Base64Input.model_validate(await request.json())
            value = payload.image
            if value.startswith('data:'):
                header, value = value.split(',', 1)
                if header not in {'data:image/jpeg;base64', 'data:image/png;base64', 'data:image/webp;base64'}:
                    raise ValueError('Invalid data URL')
            if len(value) > ((settings.MAX_IMAGE_SIZE_MB * 1024**2 + 2) // 3) * 4:
                raise HTTPException(413, 'La imagen Base64 supera el límite de tamaño.')
            data = check_size(base64.b64decode(value, validate=True))
        except (ValidationError, ValueError, binascii.Error) as exc:
            raise HTTPException(400, 'Envía un JSON válido con el campo image en Base64.') from exc
    elif kind == 'multipart/form-data':
        async with request.form(max_files=1, max_fields=1) as form:
            files = form.getlist('file')
            if len(files) != 1 or len(form.multi_items()) != 1:
                raise HTTPException(400, 'Envía exactamente una imagen en el campo file.')
            data = await read_upload(files[0])
    else:
        raise HTTPException(415, 'Usa multipart/form-data o application/json.')
    array = await run_in_threadpool(prepare, data)
    result = await run_in_threadpool(infer, array, loader)
    return await persist_if_requested(request, result, data, files[0].filename if kind == 'multipart/form-data' else 'imagen.jpg')

@router.post('/predict/batch', response_model=list[PredictResponse], openapi_extra={
    'requestBody': {'required': True, 'content': {'multipart/form-data': {'schema': {
        'type': 'object', 'required': ['files'], 'properties': {'files': {'type': 'array', 'items': {'type': 'string', 'format': 'binary'}}}}}}}})
async def predict_batch(request: Request, loader=Depends(get_loader)):
    if request.headers.get('content-type', '').split(';')[0] != 'multipart/form-data':
        raise HTTPException(415, 'Usa multipart/form-data con el campo files.')
    prepared = []
    original = []
    total = 0
    async with request.form(max_files=settings.MAX_BATCH_FILES + 1, max_fields=1) as form:
        files = form.getlist('files')
        if not files or len(files) > settings.MAX_BATCH_FILES or len(form.multi_items()) != len(files):
            raise HTTPException(400, f'Envía entre 1 y {settings.MAX_BATCH_FILES} imágenes en files.')
        for index, file in enumerate(files):
            try:
                data = await read_upload(file)
                total += len(data)
                if total > settings.MAX_BATCH_SIZE_MB * 1024**2:
                    raise HTTPException(413, 'El lote supera el límite total de tamaño.')
                prepared.append(await run_in_threadpool(prepare, data))
                original.append((data, file.filename or f'Imagen {index + 1}'))
            except HTTPException as exc:
                raise HTTPException(exc.status_code, f'Imagen {index + 1}: {exc.detail}') from exc
    # Validate the entire batch before any inference. Order matches the upload.
    results = [await run_in_threadpool(infer, array, loader) for array in prepared]
    if request.query_params.get('persist') is not None:
        for index, result in enumerate(results):
            data, name = original[index]
            await persist_if_requested(request, result, data, name)
    return results
