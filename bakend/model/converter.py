"""Rebuild banana.keras using the original TF.js graph and weights."""
from pathlib import Path
import sys
BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
from src.model.tfjs_import import import_tfjs
if __name__ == '__main__':
    model = import_tfjs(BASE.parent / 'Modelo/model.json')
    destination = BASE / 'model/banana.keras'
    model.save(destination)
    print(f'Saved {destination.name}: {model.count_params():,} parameters')
