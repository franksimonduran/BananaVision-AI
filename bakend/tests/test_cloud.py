"""Cloud persistence regression tests without TensorFlow or external services."""
from io import BytesIO
from uuid import uuid4
from datetime import datetime, timezone
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from src.cloud import CloudService, router


class MemoryBucket:
    def __init__(self):
        self.objects = {}

    def put_object(self, *, Bucket, Key, Body, **kwargs):
        self.objects[(Bucket, Key)] = bytes(Body)

    def get_object(self, *, Bucket, Key):
        return {"Body": BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, *, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


class ExamplePrediction:
    label = "NO APTO"
    confidence = 0.92
    inference_time_ms = 32

    def model_dump(self, mode="json"):
        return {"label": self.label, "confidence": self.confidence,
                "inference_time_ms": self.inference_time_ms,
                "recommendation": {"action": "Revisar manualmente."}}


def photo():
    b = BytesIO()
    Image.new("RGB", (50, 50), "yellow").save(b, format="PNG")
    return b.getvalue()


@pytest.fixture()
def environment(tmp_path, monkeypatch):
    monkeypatch.delenv("PUBLIC_ORIGIN", raising=False)
    monkeypatch.setenv("BV_SIGNUP_ENABLED", "true")
    svc = CloudService(
        "sqlite+pysqlite:///" + str(tmp_path / "cloud.sqlite"),
        bucket="private-photos", endpoint="https://bucket.invalid",
        access_key="testing", secret_key="testing",
        s3=MemoryBucket())
    app = FastAPI()
    app.state.cloud = svc
    app.include_router(router)
    return svc, app


def client(app):
    instance = TestClient(app)
    instance.headers["Origin"] = "http://testserver"
    return instance


def register(api, email, password="secure-password-2026"):
    result = api.post("/cloud/register", json={"email": email, "password": password})
    assert result.status_code == 200, result.text
    assert "httponly" in result.headers["set-cookie"].lower()
    assert "samesite=lax" in result.headers["set-cookie"].lower()
    return result.json()["user"]


def test_registered_users_have_separate_history_and_private_photos(environment):
    svc, app = environment
    ana = client(app)
    beto = client(app)
    user_a = register(ana, "ana@example.com")
    register(beto, "beto@example.com")
    scan_id = svc.store(user_a["id"], "analysis", photo(), "banana.png", ExamplePrediction())
    one = ana.get("/cloud/history")
    two = beto.get("/cloud/history")
    assert one.status_code == 200 and len(one.json()) == 1
    assert one.json()[0]["id"] == scan_id
    assert two.status_code == 200 and two.json() == []
    assert ana.get(f"/cloud/history/{scan_id}/image").status_code == 200
    assert beto.get(f"/cloud/history/{scan_id}/image").status_code == 404
    assert beto.get(f"/cloud/history/{scan_id}").status_code == 404
    assert beto.delete("/cloud/history").json()["deleted"] == 0
    assert len(ana.get("/cloud/history").json()) == 1
    assert ana.delete("/cloud/history").json()["deleted"] == 1
    assert not svc.s3.objects


def test_auth_bad_password_duplicate_signout_and_csrf(environment):
    svc, app = environment
    api = client(app)
    assert api.get("/cloud/me").json()["user"] is None
    register(api, "test@example.com")
    assert api.post("/cloud/register", json={
        "email": "test@example.com", "password": "another-password-2026"
    }).status_code == 409
    assert api.post("/cloud/login", json={
        "email": "test@example.com", "password": "wrong"
    }).status_code == 401
    assert api.post("/cloud/logout", headers={"Origin": "https://evil.invalid"}).status_code == 403
    assert api.post("/cloud/logout").status_code == 200
    assert api.get("/cloud/history").status_code == 401
    assert api.post("/cloud/login", json={
        "email": "test@example.com", "password": "secure-password-2026"
    }).status_code == 200
    assert api.get("/cloud/me").json()["user"]["email"] == "test@example.com"


def test_cloud_rejections_also_appear_in_history_and_can_be_deleted(environment):
    svc, app = environment
    api = client(app)
    user = register(api, "cam@example.com")
    scan_id = svc.store(user["id"], "rejection", photo(), "camara.jpg", ExamplePrediction())
    saved = api.get("/cloud/rejections?limit=50")
    assert saved.status_code == 200 and saved.json()["total"] == 1
    assert api.get(f"/cloud/rejections/{scan_id}/image").status_code == 200
    history = api.get("/cloud/history").json()
    assert len(history) == 1 and history[0]["id"] == scan_id
    assert api.get(f"/cloud/history/{scan_id}/image").status_code == 200
    assert api.delete(f"/cloud/rejections/{scan_id}").json()["deleted"] == 1
    assert api.get("/cloud/rejections").json()["total"] == 0
    assert api.get("/cloud/history").json() == []


def test_import_browser_history_idempotently_even_without_photo(environment):
    svc, app = environment
    api = client(app)
    register(api, "import@example.com")
    old_id = str(uuid4())
    metadata = {
        "id": old_id, "name": "Anterior", "label": "APTO",
        "confidence": 0.84, "inference_time_ms": 38.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "result": {"recommendation": {"action": "Evaluación manual"}},
    }
    first = api.post("/cloud/import", data={"metadata": json.dumps(metadata)})
    assert first.status_code == 200, first.text
    again = api.post("/cloud/import", data={"metadata": json.dumps(metadata)})
    assert again.status_code == 200
    assert len(api.get("/cloud/history").json()) == 1
    assert api.get(f"/cloud/history/{old_id}/image").status_code == 404
    assert api.get(f"/cloud/history/{old_id}").json()["data"]["source"] == "imported_from_browser"


def test_can_delete_account_and_all_private_images(environment):
    svc, app = environment
    api = client(app)
    user = register(api, "delete@example.com")
    svc.store(user["id"], "analysis", photo(), "demo.jpg", ExamplePrediction())
    bad = api.post("/cloud/delete-account", json={"password": "incorrect"})
    assert bad.status_code == 403
    good = api.post("/cloud/delete-account", json={"password": "secure-password-2026"})
    assert good.status_code == 200
    assert not svc.s3.objects
    assert api.get("/cloud/me").json()["user"] is None
    assert api.get("/cloud/history").status_code == 401


def test_prediction_api_saves_trusted_model_result_and_camera_rejections(environment):
    """Storage is triggered by /predict; the browser never invents model scores."""
    from src.api.routes import router as predictor_router, get_loader

    svc, app = environment
    app.include_router(predictor_router)

    class Stub:
        label = "APTO"

        def predict(self, array):
            assert array.shape == (1, 224, 224, 3)
            return self.label, .95, 15.0, {
                "NO APTO": .05 if self.label == "APTO" else .95,
                "APTO": .95 if self.label == "APTO" else .05,
            }

    model = Stub()
    app.dependency_overrides[get_loader] = lambda: model
    api = client(app)
    register(api, "sample@example.com")
    payload = {"file": ("banana.png", photo(), "image/png")}

    # Ordinary prediction has no cloud side-effect (guest/local contract).
    ordinary = api.post("/predict", files=payload)
    assert ordinary.status_code == 200
    assert ordinary.json()["record_id"] is None
    assert api.get("/cloud/history").json() == []

    # Credentialed save must reject requests from other origins.
    bad = api.post("/predict?persist=analysis", files=payload,
                   headers={"Origin": "https://evil.invalid"})
    assert bad.status_code == 403
    assert api.get("/cloud/history").json() == []

    saved = api.post("/predict?persist=analysis", files=payload)
    assert saved.status_code == 200, saved.text
    record_id = saved.json()["record_id"]
    assert record_id
    assert api.get("/cloud/history").json()[0]["id"] == record_id
    assert api.get(f"/cloud/history/{record_id}/image").status_code == 200

    # Continuous mode stores only model-confirmed NO APTO, never APTO.
    passing_frame = api.post("/predict?persist=rejection", files=payload)
    assert passing_frame.status_code == 200 and passing_frame.json()["capture_id"] is None
    assert api.get("/cloud/rejections").json()["total"] == 0
    model.label = "NO APTO"
    rejected_frame = api.post("/predict?persist=rejection", files=payload)
    assert rejected_frame.status_code == 200, rejected_frame.text
    assert rejected_frame.json()["capture_id"]
    assert api.get("/cloud/rejections").json()["total"] == 1
    assert len(api.get("/cloud/history").json()) == 2



def test_private_anonymous_browsers_save_history_without_login(environment, monkeypatch):
    svc, app = environment
    monkeypatch.setenv("BV_ANONYMOUS_ONLY", "true")
    first = client(app)
    second = client(app)
    assert first.get("/cloud/me").json()["user"] is None
    answer = first.post("/cloud/anonymous")
    assert answer.status_code == 200, answer.text
    guest = answer.json()["user"]
    assert guest["anonymous"] is True
    assert "httponly" in answer.headers["set-cookie"].lower()
    assert "samesite=lax" in answer.headers["set-cookie"].lower()
    assert "max-age=31536000" in answer.headers["set-cookie"].lower()
    assert first.get("/cloud/me").json()["user"]["id"] == guest["id"]
    assert first.post("/cloud/anonymous").json()["user"]["id"] == guest["id"]

    assert first.post("/cloud/register", json={
        "email": "person@example.com", "password": "long-strong-password"
    }).status_code == 404
    assert first.post("/cloud/login", json={
        "email": "person@example.com", "password": "long-strong-password"
    }).status_code == 404
    assert first.post("/cloud/logout").status_code == 404

    capture_id = svc.store(guest["id"], "rejection", photo(), "camera.jpg", ExamplePrediction())
    assert len(first.get("/cloud/history").json()) == 1
    assert first.get(f"/cloud/history/{capture_id}").status_code == 200
    assert first.get(f"/cloud/history/{capture_id}/image").status_code == 200

    assert second.get("/cloud/history").status_code == 401
    other_user = second.post("/cloud/anonymous").json()["user"]
    assert other_user["id"] != guest["id"]
    assert second.get("/cloud/history").json() == []
    assert second.get(f"/cloud/history/{capture_id}/image").status_code == 404
    assert second.delete("/cloud/history").json()["deleted"] == 0
    assert first.get("/cloud/history").json()[0]["id"] == capture_id
    assert first.delete("/cloud/history").json()["deleted"] == 1
    assert svc.s3.objects == {}
