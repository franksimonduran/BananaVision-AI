from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

BananaLabel = Literal['APTO', 'NO APTO', 'SIN PLÁTANO']

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
    label: BananaLabel
    predicted_class: BananaLabel
    confidence: float = Field(ge=0, le=1)
    probabilities: dict[str, float]
    conclusive: bool = True
    threshold: float
    recommendation: Recommendation
    inference_time_ms: float = Field(ge=0)
    scope: str = 'Evaluación visual preliminar; no certifica seguridad alimentaria.'
    record_id: str | None = None
    capture_id: str | None = None
class ModelInfo(BaseModel):
    input_shape: list[int]
    classes: list[str]
    model_name: str
    parameters: int
    preprocessing: str
    validation_status: str
