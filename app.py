"""Arranca BananaVision AI: prepara el entorno local si falta y abre el servidor.

    python app.py              instala lo que falte y sirve http://127.0.0.1:8000
    python app.py --rebuild    reconstruye el entorno local y arranca

No necesita setup.bat, start.bat, start.ps1 ni start.sh, ni activar el entorno virtual.
"""
from pathlib import Path
import argparse
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / 'bakend'
BOOTSTRAP = ROOT / 'scripts' / 'bootstrap.py'
LAUNCH = ROOT / 'scripts' / 'launch.py'
VENV = BACKEND / '.venv'
VENV_PYTHON = VENV / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
READY = 'BANANAVISION_ENV_READY'

parser = argparse.ArgumentParser(description='Prepara el entorno y arranca BananaVision AI.')
parser.add_argument('--rebuild', action='store_true',
                    help='Reconstruye el entorno local, conserva el anterior como respaldo y arranca.')
args = parser.parse_args()


def run_in_venv(*arguments):
    """Sustituye este proceso por otro que usa el intérprete del entorno local."""
    os.environ[READY] = '1'
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *arguments])


if not os.environ.get(READY) and Path(sys.prefix).resolve() != VENV.resolve():
    if VENV_PYTHON.exists() and not args.rebuild:
        run_in_venv(str(ROOT / 'app.py'), *sys.argv[1:])
    print('Preparando el entorno local. La primera vez descarga las dependencias...', flush=True)
    try:
        subprocess.run([sys.executable, str(BOOTSTRAP), *(['--rebuild'] if args.rebuild else [])], check=True)
    except subprocess.CalledProcessError as exc:
        print(f'No se pudo preparar el entorno: {exc}')
        sys.exit(1)
    except KeyboardInterrupt:
        print('\nInstalación cancelada.')
        sys.exit(1)
    run_in_venv(str(ROOT / 'app.py'), *sys.argv[1:])

os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), str(LAUNCH)])