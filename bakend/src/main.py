import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from .api.routes import router
from .model.loader import ModelLoader
from .config import settings, BASE

@asynccontextmanager
async def lifespan(app):
    app.state.loader = None
    try:
        app.state.loader = await run_in_threadpool(ModelLoader(settings.model_path).load)
    except Exception:
        logging.getLogger(__name__).exception('Model startup failed')
    yield

app = FastAPI(title='BananaVision AI API', version='3.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.ALLOWED_ORIGINS,
                   allow_credentials=False, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])

@app.middleware('http')
async def limit_body(request: Request, call_next):
    if request.method == 'POST':
        limit_mb = settings.MAX_BATCH_SIZE_MB if request.url.path == '/predict/batch' else settings.MAX_IMAGE_SIZE_MB * 4 / 3
        cap = int(limit_mb * 1024**2) + 1024 * 1024
        length = request.headers.get('content-length')
        if length:
            try:
                if int(length) < 0:
                    raise ValueError()
                if int(length) > cap:
                    return JSONResponse({'detail': 'La solicitud supera el límite de tamaño.'}, status_code=413)
            except ValueError:
                return JSONResponse({'detail': 'Content-Length inválido.'}, status_code=400)
        parts, total = [], 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > cap:
                return JSONResponse({'detail': 'La solicitud supera el límite de tamaño.'}, status_code=413)
            parts.append(chunk)
        request._body = b''.join(parts)
    return await call_next(request)

app.include_router(router)
# One origin, one server; API routes are registered before the frontend mount.
app.mount('/', StaticFiles(directory=BASE.parent / 'frontend', html=True), name='frontend')
