"""Start one local API/frontend process, open a browser after readiness."""
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import urllib.error
import webbrowser
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'bakend'
sys.path.insert(0, str(BACKEND))
try:
    from src.config import settings
except ImportError:
    print('Falta el entorno local. Ejecuta python app.py para instalarlo y arrancar.')
    sys.exit(1)
address = '127.0.0.1' if settings.HOST in ('0.0.0.0', '127.0.0.1') else settings.HOST
url = f'http://{address}:{settings.PORT}'
try:
    urllib.request.urlopen(url + '/health', timeout=1).close()
    print(f'Ya existe un servicio en {url}. Deténlo antes de iniciar este proyecto.')
    sys.exit(1)
except urllib.error.HTTPError:
    print(f'El puerto {settings.PORT} ya está ocupado. Detén el servidor anterior o cambia PORT en .env.')
    sys.exit(1)
except (urllib.error.URLError, TimeoutError):
    pass
process = subprocess.Popen([sys.executable, str(BACKEND / 'run.py')], cwd=BACKEND)
try:
    print('Iniciando BananaVision AI. La primera carga puede tardar unos segundos...', flush=True)
    ready = False
    for _ in range(180):
        if process.poll() is not None:
            raise RuntimeError('El servidor no pudo iniciarse. Consulta el error mostrado arriba.')
        try:
            with urllib.request.urlopen(url + '/health', timeout=1) as response:
                ready = response.status == 200
            if ready:
                break
        except urllib.error.HTTPError as exc:
            if exc.code == 503:
                print('La interfaz está lista, pero el modelo no se cargó. Ejecuta python app.py y reinicia. Para reparar un entorno antiguo: python app.py --rebuild', flush=True)
                ready = True
                break
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(.5)
    if not ready:
        raise RuntimeError('El servidor no estuvo listo a tiempo. Consulta el registro.')
    print(f'Abre {url}\nDocumentación de API: {url}/docs\nMantén esta ventana abierta. Ctrl+C para salir.', flush=True)
    webbrowser.open(url)
    process.wait()
except KeyboardInterrupt:
    print('\nCerrando BananaVision AI...')
except Exception as exc:
    print(exc)
    sys.exit(1)
finally:
    if process.poll() is None:
        process.terminate()
        try:process.wait(timeout=8)
        except subprocess.TimeoutExpired:process.kill()
