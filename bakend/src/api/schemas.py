from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

class Base64Input(BaseModel):
    model_config = ConfigDict(extra='forbid')
    image: str = Field(min_length=1)
class Recommendation(BaseModel):
    message: str
    destination: str
    timing: str
    action: str
    storage: str
class PredictResponse(BaseModel):
    label: Literal['APTO', 'NO APTO', 'NO CONCLUYENTE']
    predicted_class: Literal['APTO', 'NO APTO']
    confidence: float = Field(ge=0, le=1)
    probabilities: dict[str, float]
    conclusive: bool
    threshold: float
    recommendation: Recommendation
    inference_time_ms: float = Field(ge=0)
    scope: str = 'Evaluación visual preliminar; no certifica seguridad alimentaria.'
class ModelInfo(BaseModel):
    input_shape: list[int]
    classes: list[str]
    model_name: str
    parameters: int
    preprocessing: str
    validation_status: str
