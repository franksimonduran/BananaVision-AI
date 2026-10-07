# BananaVision AI

Aplicación web de **evaluación visual asistida por IA** para plátanos: clasifica una fotografía como `APTO` o `NO APTO` y, cuando la confianza es baja, devuelve `NO CONCLUYENTE`. Backend en FastAPI con un modelo Keras y frontend en JavaScript vanilla.

## Características

- Análisis visual `APTO`, `NO APTO` o `NO CONCLUYENTE`, con probabilidades y tiempo de inferencia.
- **Sin registro ni inicio de sesión.** Cada navegador obtiene automáticamente un identificador privado mediante una cookie HttpOnly.
- **Todos los resultados NO APTO del análisis continuo se guardan automáticamente en el historial** con fotografía, confianza y fecha. Los fotogramas APTO y NO CONCLUYENTE del modo continuo no se registran.
- La carga de imágenes y los análisis manuales siguen guardando sus resultados, independientemente de la clasificación.
- Galería de las últimas 200 capturas NO APTO, filtros del historial y exportación CSV.
- En Railway, PostgreSQL almacena los metadatos y un bucket privado almacena las fotografías. Sin `DATABASE_URL`, usa localStorage/IndexedDB.
- Importación voluntaria del historial local previo, sin borrar los datos de origen.
- Aviso de voz opcional para NO APTO. Cámara web solo tras autorización del usuario.

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

### Historial automático privado, PostgreSQL y fotografías

En Railway se usa el servicio `Postgres` y el bucket privado `BananaVisionPhotos`. No se exponen contraseñas en GitHub. Variables necesarias:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
BV_S3_ENDPOINT=${{BananaVisionPhotos.ENDPOINT}}
BV_S3_BUCKET=${{BananaVisionPhotos.BUCKET}}
BV_S3_REGION=${{BananaVisionPhotos.REGION}}
BV_S3_ACCESS_KEY=${{BananaVisionPhotos.ACCESS_KEY_ID}}
BV_S3_SECRET_KEY=${{BananaVisionPhotos.SECRET_ACCESS_KEY}}
PUBLIC_ORIGIN=https://bananavision-ai-production.up.railway.app
BV_ANONYMOUS_ONLY=true
BV_SIGNUP_ENABLED=false
```

**Uso sin cuentas:** abre la web, permite la cámara o sube una imagen y analiza. El servidor asigna automáticamente una sesión anónima con cookie privada por navegador. No hay formulario de registro ni inicio de sesión. Cada `NO APTO` detectado en cámara continua entra al historial automáticamente y puede consultarse con su fotografía. Una muestra manual también se guarda, incluso si es APTO o NO CONCLUYENTE.

**Privacidad:** cada navegador tiene su propio historial; los visitantes de la URL pública no pueden acceder a fotografías ajenas. No equivale a sincronización entre dispositivos: sin cuenta, no existe forma de recuperar ese historial desde otro dispositivo y si se eliminan las cookies puede perderse la clave de acceso aunque los registros aún estén en PostgreSQL. La sesión anónima dura 365 días y se renueva al visitar la aplicación.

**Retención:** máximo 1.000 resultados en total por navegador, incluidos NO APTO automáticos. El sistema elimina los más antiguos y sus fotografías al superar el límite. La galería especial muestra las últimas 200 capturas NO APTO; el historial reúne las capturas automáticas y los análisis manuales. **Cada NO APTO automático consume almacenamiento**, por lo que una cámara que permanezca en modo continuo puede generar muchos registros; revisa los costes de Railway.

**Datos anteriores:** si este navegador ya tenía registros locales, utiliza «Importar historial local» para agregarlos a su historial privado en PostgreSQL sin eliminar los originales.

**Respaldo y seguridad:** las fotos se convierten a JPEG reducido, se guardan en el bucket privado y se entregan solo a su sesión anónima. Los tokens son cookies HttpOnly con atributo Secure en HTTPS y no se guardan en localStorage. No borres cookies ni uses modo incógnito para registros que necesites conservar. Configura copias de seguridad de PostgreSQL y una política de retención del bucket antes de usar el servicio con información importante.

Sin `DATABASE_URL` el historial funciona únicamente en el navegador y no está sincronizado con Railway.

En Railway:

1. conecta este repositorio;
2. despliega desde la rama `main`;
3. Railway detectará automáticamente el `Dockerfile`;
4. configura el health check en `/health`;
5. genera un dominio público HTTPS.

El contenedor ejecuta un único worker de Uvicorn, escucha en `0.0.0.0` y utiliza automáticamente `PORT`. PostgreSQL y el bucket permiten persistencia automática por navegador sin credenciales de usuario.

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
| `GET /health` | Estado del servicio, modelo y almacenamiento |
| `GET /model/info` | Metadatos del modelo |
| `POST /predict` y `POST /predict/batch` | Análisis visual |
| `POST /cloud/anonymous` | Activa/renueva una sesión anónima privada sin contraseña |
| `GET /cloud/me` | Estado de la sesión de este navegador |
| `POST /predict?persist=analysis` | Analiza y guarda una muestra manual |
| `POST /predict?persist=rejection` | Solo guarda los fotogramas NO APTO del modo continuo |
| `GET /cloud/history` | Historial conjunto: análisis manuales + NO APTO automáticos |
| `GET /cloud/history/{id}` y `GET /cloud/history/{id}/image` | Detalles y fotografía privada |
| `GET /cloud/rejections` | Últimas 200 capturas de cámara NO APTO |
| `POST /cloud/import` | Importación voluntaria de historial local |
| `GET /docs` | Documentación Swagger |

Con `BV_ANONYMOUS_ONLY=true` quedan desactivados registro, login, logout y eliminación de cuenta por contraseña. Los endpoints de historial verifican la cookie anónima.

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

Los recorridos de navegador (`frontend/tests/browser.mjs`, `source-browser.mjs`, `live.mjs`) requieren Playwright instalado aparte. Las pruebas de nube usan SQLite temporal y un bucket S3 simulado; comprueban aislamiento entre navegadores anónimos, fotografías, NO APTO automático e importación.

## Estructura

```
app.py          Punto de entrada (prepara el entorno y arranca el servidor)
bakend/         API FastAPI (src/), modelo Keras (model/) y tests
frontend/       Interfaz web (HTML, CSS, JS) y tests
Modelo/         Modelo TF.js original (model.json, weights.bin, metadata.json)
scripts/        Instalación, arranque y evaluación
docs/           Notas de verificación
```
