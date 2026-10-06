"""Local per-project setup; never activates a shell environment."""
from pathlib import Path
import argparse
from datetime import datetime
import subprocess
import struct
import sys
import venv
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'bakend'
parser = argparse.ArgumentParser(description='Instala y comprueba BananaVision AI.')
parser.add_argument('--rebuild', action='store_true', help='Crea un entorno limpio y conserva el anterior como respaldo.')
args = parser.parse_args()
if not (3, 10) <= sys.version_info[:2] <= (3, 12):
    print('Necesitas Python 3.10, 3.11 o 3.12 de 64 bits. Recomendado: 3.11. No utilices Python 3.13 o posterior con este TensorFlow.')
    sys.exit(1)
if struct.calcsize('P') != 8:
    print('TensorFlow necesita Python de 64 bits.')
    sys.exit(1)
try:
    env = BACKEND / '.venv'
    if args.rebuild and env.exists():
        backup = BACKEND / ('.venv-backup-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        env.rename(backup)
        print(f'Entorno anterior conservado en {backup.name}', flush=True)
    if not env.exists():
        print('Creando entorno local...')
        venv.EnvBuilder(with_pip=True).create(env)
    executable = env / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    subprocess.run([str(executable), '-m', 'pip', 'install', '-r', str(BACKEND / 'requirements.txt')], check=True)
    if not (BACKEND / 'model/banana.keras').exists():
        subprocess.run([str(executable), str(BACKEND / 'model/converter.py')], check=True)
    subprocess.run([str(executable), '-m', 'pip', 'check'], check=True)
    subprocess.run([str(executable), '-c',
                    'from src.config import settings; from src.model.loader import ModelLoader; '
                    'ModelLoader(settings.model_path).load(); print("Modelo cargado correctamente.")'],
                   cwd=BACKEND, check=True)
    print('\nInstalación lista. Ejecuta python app.py para arrancar la aplicación.')
except (OSError, subprocess.CalledProcessError) as exc:
    print(f'No se pudo completar la instalación: {exc}')
    print('Si el entorno tiene dependencias antiguas, ejecuta: python app.py --rebuild')
    sys.exit(1)
