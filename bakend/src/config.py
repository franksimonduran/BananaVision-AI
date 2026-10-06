from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE = Path(__file__).resolve().parents[1]
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE / '.env', extra='ignore')
    HOST: str = '127.0.0.1'
    PORT: int = Field(8000, ge=1, le=65535)
    MODEL_PATH: str = 'model/banana.keras'
    CONFIDENCE_THRESHOLD: float = Field(0.7, ge=0.5, le=1)
    MAX_IMAGE_SIZE_MB: int = Field(5, ge=1, le=20)
    MAX_BATCH_FILES: int = Field(10, ge=1, le=20)
    MAX_BATCH_SIZE_MB: int = Field(20, ge=1, le=100)
    MAX_IMAGE_PIXELS: int = Field(20_000_000, ge=1)
    ALLOWED_ORIGINS: list[str] = ['http://localhost:5500', 'http://127.0.0.1:5500']
    @property
    def model_path(self):
        p = Path(self.MODEL_PATH)
        return p if p.is_absolute() else BASE / p
settings = Settings()
