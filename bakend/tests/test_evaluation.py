import importlib.util
from pathlib import Path
import pytest
from PIL import Image
from src.config import BASE

spec=importlib.util.spec_from_file_location('evaluator',BASE.parent/'scripts/evaluate.py')
evaluator=importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluator)

class Model:
    classes=['NO APTO','APTO']
    def __init__(self): self.calls=iter([('NO APTO',.9),('APTO',.6),('APTO',.9),('APTO',.95)])
    def predict(self,array):
        label,confidence=next(self.calls)
        return label,confidence,1.0,{}

def test_metrics_with_abstentions(tmp_path):
    for label in Model.classes:
        folder=tmp_path/label;folder.mkdir()
        for i in range(2):Image.new('RGB',(224,224),'yellow').save(folder/f'{i}.png')
    result=evaluator.evaluate(tmp_path,Model())
    assert result['confusion_matrix_true_rows_predicted_columns']==[[1,1],[0,2]]
    assert result['accuracy']==.75
    assert result['coverage']==.75
    assert result['accuracy_on_conclusive_samples']==1
    assert result['per_class']['NO APTO']['recall']==.5
    assert result['per_class']['APTO']['precision']==pytest.approx(2/3)

def test_requires_each_class(tmp_path):
    with pytest.raises(ValueError,match='No hay imágenes'):
        evaluator.evaluate(tmp_path,Model())
