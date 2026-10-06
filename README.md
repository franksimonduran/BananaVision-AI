# BananaVision AI

Aplicación local de **evaluación visual asistida por IA** para plátanos: clasifica una fotografía como `APTO` o `NO APTO` y, cuando la confianza es baja, devuelve `NO CONCLUYENTE`. Backend en FastAPI con un modelo Keras y frontend en JavaScript vanilla.

## Características

- Análisis visual `APTO` / `NO APTO`, con probabilidades por clase, umbral mínimo y tiempo de inferencia.
- Estado `NO CONCLUYENTE` cuando la confianza no alcanza el umbral (70 % por defecto).
- Cámara en vivo (se inicia con el botón «Iniciar cámara en vivo») y carga o arrastre de imágenes, individuales o por lote.
- Modo continuo: las lecturas automáticas no se cuentan como muestras nuevas ni se guardan en el historial; los `NO APTO` del modo continuo se conservan como capturas (máximo 200).
- Historial local en el navegador, con filtros y exportación a CSV.
- Aviso de voz opcional para `NO APTO`.
- API FastAPI + TensorFlow/Keras.

## Requisitos

Python 3.11 recomendado (3.10–3.12; TensorFlow 2.16.1 no es compatible con 3.13+).

> Los documentos y capturas de `docs/` corresponden a registros de verificación y algunas imágenes pueden reflejar revisiones anteriores de la interfaz.

## Instalación rápida

Windows, macOS y Linux, desde la raíz del proyecto:

```bash
python app.py        # en macOS/Linux puede ser python3 app.py
```

La primera vez crea el entorno local e instala las dependencias; después abre <http://127.0.0.1:8000>. `python app.py --rebuild` recrea el entorno.

## Ejecución manual

```bash
cd bakend
pip install -r requirements.txt
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000
```

Configuración opcional: copia `bakend/.env.example` a `bakend/.env` (no se sube al repositorio).

## Despliegue

El repositorio incluye un `Dockerfile` de producción preparado para servicios compatibles con contenedores, incluido Railway.

En Railway:

1. conecta este repositorio;
2. despliega desde la rama `main`;
3. Railway detectará automáticamente el `Dockerfile`;
4. configura el health check en `/health`;
5. genera un dominio público HTTPS.

El contenedor ejecuta un único worker de Uvicorn, escucha en `0.0.0.0` y utiliza automáticamente la variable `PORT` proporcionada por la plataforma. No se necesita una base de datos para la versión actual: el historial se conserva en el navegador del usuario.

Variables opcionales de producción:

```text
CONFIDENCE_THRESHOLD=0.7
MAX_IMAGE_SIZE_MB=5
MAX_BATCH_FILES=10
MAX_BATCH_SIZE_MB=20
MAX_IMAGE_PIXELS=20000000
```

La cámara web requiere HTTPS en producción.

## API

| Endpoint | Descripción |
|---|---|
| `GET /health` | Estado del servicio y del modelo |
| `GET /model/info` | Metadatos del modelo |
| `POST /predict` | Clasifica una imagen (multipart o JSON Base64) |
| `POST /predict/batch` | Clasifica un lote de imágenes |
| `GET /docs` | Documentación interactiva (Swagger) |

## Modelo

**Clasificador visual experimental.** Modelo Keras (`bakend/model/banana.keras`) reconstruido a partir del modelo TF.js incluido en `Modelo/`. No se dispone de un conjunto de validación independiente, por lo que no se publica ninguna métrica de precisión.

## Limitaciones

- Es una evaluación visual, no una certificación de calidad ni de exportación.
- No sustituye la inspección manual ni los controles requeridos por el comprador.
- La confianza del modelo no equivale a precisión validada.
- Objetos fuera del dominio (otras frutas, fondos, manos) pueden recibir una clasificación incorrecta.

## Tests

```bash
# Frontend (Node, sin dependencias)
node frontend/tests/data.test.mjs
node frontend/tests/api.test.mjs
node frontend/tests/voice.test.mjs
node frontend/tests/dom.test.mjs

# Backend
cd bakend && pip install -r requirements-dev.txt && python -m pytest
```

Los recorridos de navegador (`frontend/tests/browser.mjs`, `source-browser.mjs`, `live.mjs`) requieren Playwright instalado aparte.

## Estructura

```
app.py          Punto de entrada (prepara el entorno y arranca el servidor)
bakend/         API FastAPI (src/), modelo Keras (model/) y tests
frontend/       Interfaz web (HTML, CSS, JS) y tests
Modelo/         Modelo TF.js original (model.json, weights.bin, metadata.json)
scripts/        Instalación, arranque y evaluación
docs/           Notas de verificación
```
