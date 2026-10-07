# BananaVision AI

Aplicación web de **evaluación visual asistida por IA** para plátanos: clasifica una fotografía como `APTO` o `NO APTO` y, cuando la confianza es baja, devuelve `NO CONCLUYENTE`. Backend en FastAPI con un modelo Keras y frontend en JavaScript vanilla.

## Características

- Análisis visual `APTO` / `NO APTO`, con probabilidades por clase, umbral mínimo y tiempo de inferencia.
- Estado `NO CONCLUYENTE` cuando la confianza no alcanza el umbral (70 % por defecto).
- Cámara en vivo (se inicia con el botón «Iniciar cámara en vivo») y carga o arrastre de imágenes, individuales o por lote.
- Modo continuo: las lecturas automáticas no se cuentan como muestras nuevas ni se guardan en el historial; los `NO APTO` del modo continuo se conservan como capturas (máximo 200).
- Modo invitado: historial local en el navegador, con filtros y exportación CSV.
- Cuentas privadas: historial en PostgreSQL y fotografías reducidas en un bucket S3 privado; sincronización al iniciar sesión desde otro dispositivo.
- Importación voluntaria del historial del navegador anterior; los datos locales originales se conservan.
- Sesiones mediante cookie HttpOnly, contraseñas Argon2 y comprobación de origen para cambios autenticados.
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

La primera vez crea el entorno local e instala las dependencias; después abre <http://127.0.0.1:8000>. `python app.py --rebuild` recrea el entorno. **Después de actualizar desde una versión anterior**, usa `python app.py --rebuild` una vez para instalar las nuevas dependencias.

## Ejecución manual

```bash
cd bakend
pip install -r requirements.txt
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000
```

Configuración opcional: copia `bakend/.env.example` a `bakend/.env` (no se sube al repositorio).

## Despliegue

El repositorio incluye un `Dockerfile` de producción preparado para servicios compatibles con contenedores, incluido Railway.

### Cuentas, PostgreSQL y fotografías privadas

En Railway se utilizan un servicio **Postgres** y un bucket privado **BananaVisionPhotos**. La aplicación usa variables referenciadas, sin copiar las claves secretas al repositorio:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
BV_S3_ENDPOINT=${{BananaVisionPhotos.ENDPOINT}}
BV_S3_BUCKET=${{BananaVisionPhotos.BUCKET}}
BV_S3_REGION=${{BananaVisionPhotos.REGION}}
BV_S3_ACCESS_KEY=${{BananaVisionPhotos.ACCESS_KEY_ID}}
BV_S3_SECRET_KEY=${{BananaVisionPhotos.SECRET_ACCESS_KEY}}
PUBLIC_ORIGIN=https://bananavision-ai-production.up.railway.app
BV_SIGNUP_ENABLED=true
```

**Uso:** crea una cuenta desde «Iniciar sesión» (contraseña mínima de 12 caracteres). Comprueba que tu correo aparezca en la barra superior y que el aviso diga «Guardado en la nube activado». Los análisis de imágenes y sus fotografías se guardan automáticamente en tu cuenta.

**Cámara:** al iniciar la cámara, el modo continuo realiza lecturas temporales, que no son muestras físicas distintas y no se agregan automáticamente al historial. Pulsa **«Guardar muestra en historial»** para detener el modo continuo, fotografiar y analizar una muestra concreta y guardarla en el historial (nube con sesión iniciada; navegador en modo local). Los fotogramas automáticos NO APTO se conservan por separado en la galería de capturas especiales (máximo 200).

Al guardar, la interfaz muestra un mensaje que distingue **guardado en la nube** de **guardado en este navegador**. Para consultar los resultados desde otro dispositivo, inicia sesión con la misma cuenta. Una pantalla de resultado no es una confirmación de guardado hasta recibir el aviso correspondiente.

**Datos existentes:** los resultados almacenados anteriormente en el navegador no se suben sin consentimiento. Tras iniciar sesión, abre Historial → «Importar historial local». La importación es idempotente para los registros que tengan identificador y conserva los originales del navegador.

**Límites:** máximo 1.000 análisis y 200 capturas automáticas NO APTO por cuenta; al superar los límites se eliminan los más antiguos, incluidas sus fotos. Las imágenes se convierten a JPEG reducido y se guardan en el bucket privado, no dentro de PostgreSQL.

**Seguridad y operación:** los tokens de sesión solo viajan en cookies HttpOnly (Secure en HTTPS), expiran a los 14 días y no se guardan en localStorage. Se comprueba el origen de las escrituras autenticadas. El registro público puede cerrarse configurando `BV_SIGNUP_ENABLED=false` una vez creadas las cuentas necesarias. Actualmente no hay verificación de correo ni recuperación automática de contraseña; no se recomienda abrir el registro a usuarios desconocidos hasta añadirlas. Configura copias de seguridad para PostgreSQL y controla el consumo facturable de Postgres, el bucket y TensorFlow.

Sin `DATABASE_URL`, el programa conserva su modo local: el inicio de sesión no está habilitado y el historial permanece en el navegador.

En Railway:

1. conecta este repositorio;
2. despliega desde la rama `main`;
3. Railway detectará automáticamente el `Dockerfile`;
4. configura el health check en `/health`;
5. genera un dominio público HTTPS.

El contenedor ejecuta un único worker de Uvicorn, escucha en `0.0.0.0` y utiliza automáticamente la variable `PORT` proporcionada por la plataforma. Cuando el usuario inicia sesión, PostgreSQL y el bucket permiten el historial privado sincronizado. Sin sesión, el historial se conserva localmente en el navegador.

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
| `POST /predict?persist=analysis` | Analiza y guarda en la nube para el usuario autenticado |
| `POST /predict?persist=rejection` | Guarda solamente fotogramas NO APTO en la galería privada |
| `GET /cloud/me`, `POST /cloud/register`, `POST /cloud/login`, `POST /cloud/logout` | Sesiones y cuentas |
| `GET /cloud/history`, `GET /cloud/history/{id}` | Historial privado y detalles |
| `GET /cloud/history/{id}/image` | Fotografía privada con control de acceso |
| `GET /cloud/rejections`, `DELETE /cloud/rejections` | Capturas especiales |
| `POST /cloud/import` | Importación voluntaria de historial local |
| `POST /cloud/delete-account` | Elimina definitivamente cuenta, resultados y fotografías al confirmar contraseña |

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

Los recorridos de navegador (`frontend/tests/browser.mjs`, `source-browser.mjs`, `live.mjs`) requieren Playwright instalado aparte. Las pruebas de nube usan una base SQLite temporal y un bucket S3 simulado; comprueban aislamiento por usuario, sesiones, fotografías e importación.

## Estructura

```
app.py          Punto de entrada (prepara el entorno y arranca el servidor)
bakend/         API FastAPI (src/), modelo Keras (model/) y tests
frontend/       Interfaz web (HTML, CSS, JS) y tests
Modelo/         Modelo TF.js original (model.json, weights.bin, metadata.json)
scripts/        Instalación, arranque y evaluación
docs/           Notas de verificación
```
