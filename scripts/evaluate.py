"""Evaluate an independent labeled image folder; never invent metrics.

python scripts/evaluate.py --dataset /path/to/test --output metrics.json
Folder layout: test/APTO/*.jpg and test/NO APTO/*.jpg.
Images must be held out by physical fruit/source, not random neighboring frames.
"""
import argparse
import json
from pathlib import Path
import sys
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'bakend'))
from src.config import settings
from src.model.loader import ModelLoader
from src.model.preprocessing import load_pil_from_bytes, preprocess_image_pil

def evaluate(dataset, loader):
    classes = loader.classes
    confusion = np.zeros((2, 2), dtype=int)
    records = []
    for true_idx, label in enumerate(classes):
        directory = dataset / label
        files = sorted(p for p in directory.rglob('*') if p.is_file() and p.suffix.lower() in ('.jpg','.jpeg','.png','.webp'))
        if not files:
            raise ValueError(f'No hay imágenes de prueba en {directory}')
        for file in files:
            raw = file.read_bytes()
            if len(raw) > settings.MAX_IMAGE_SIZE_MB * 1024**2:
                raise ValueError(f'Imagen demasiado grande: {file}')
            array = preprocess_image_pil(load_pil_from_bytes(raw))
            predicted, confidence, ms, _ = loader.predict(array)
            confusion[true_idx, classes.index(predicted)] += 1
            records.append({'file':str(file.relative_to(dataset)), 'expected':label,
                            'predicted':predicted, 'confidence':confidence,
                            'conclusive':confidence >= settings.CONFIDENCE_THRESHOLD})
    per_class = {}
    for i, label in enumerate(classes):
        tp = int(confusion[i,i])
        fp = int(confusion[:,i].sum() - tp)
        fn = int(confusion[i,:].sum() - tp)
        precision = tp/(tp+fp) if tp+fp else 0.0
        recall = tp/(tp+fn) if tp+fn else 0.0
        per_class[label] = {'precision':precision,'recall':recall,'f1':2*precision*recall/(precision+recall) if precision+recall else 0.0,'support':int(confusion[i].sum())}
    accepted = [r for r in records if r['conclusive']]
    return {'samples':len(records),'classes':classes,'confusion_matrix_true_rows_predicted_columns':confusion.tolist(),
            'accuracy':float(np.trace(confusion)/confusion.sum()),'per_class':per_class,
            'macro_f1':sum(d['f1'] for d in per_class.values())/2,
            'threshold':settings.CONFIDENCE_THRESHOLD,'coverage':len(accepted)/len(records),
            'accuracy_on_conclusive_samples':sum(r['expected']==r['predicted'] for r in accepted)/len(accepted) if accepted else None,
            'records':records}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=Path('metrics.json'))
    args = parser.parse_args()
    try:
        metrics = evaluate(args.dataset,ModelLoader(settings.model_path).load())
        args.output.write_text(json.dumps(metrics,indent=2,ensure_ascii=False),encoding='utf-8')
        print(f'{metrics["samples"]} muestras. Métricas guardadas en {args.output}')
    except (OSError,ValueError) as exc:
        parser.exit(1,f'No se completó la evaluación: {exc}\n')
