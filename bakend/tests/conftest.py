from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi.testclient import TestClient
from src.main import app

@pytest.fixture(scope='session')
def real_client():
    with TestClient(app) as client:
        assert client.get('/health').status_code == 200
        yield client

@pytest.fixture
def client(real_client):
    # Same loaded model reused; tests may override the dependency locally.
    yield real_client
    app.dependency_overrides.clear()
