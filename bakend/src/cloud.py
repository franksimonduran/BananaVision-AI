"""Private account sessions and persistent BananaVision results.

The classifier remains independent: when DATABASE_URL is absent, guest/local mode
continues to work. PostgreSQL stores metadata; a private S3-compatible bucket
stores reduced JPEG photographs. Never place credentials in this repository.
"""
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from threading import Lock
from uuid import UUID, uuid4
import logging
import os
import secrets
import time

import boto3
from botocore.config import Config as S3Config
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError, VerificationError
from pydantic import BaseModel, EmailStr, Field
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import DateTime, Float, ForeignKey, Index, JSON, String, create_engine, select, delete
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

logger = logging.getLogger(__name__)
COOKIE = "bv_session"
SESSION_DAYS = 14
MAX_ANALYSES = 1000
MAX_REJECTIONS = 200
MAX_IMAGE_BYTES = 5 * 1024 * 1024
_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
_rate_lock = Lock()
_rate = defaultdict(deque)


def utcnow():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "bv_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoginSession(Base):
    __tablename__ = "bv_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("bv_accounts.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Scan(Base):
    __tablename__ = "bv_scans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("bv_accounts.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    inference_time_ms: Mapped[float] = mapped_column(Float, nullable=False)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    image_key: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (Index("ix_bv_scans_account_kind_time", "account_id", "kind", "created_at"),)


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class CloudService:
    def __init__(self, database_url: str, *, bucket: str, endpoint: str,
                 access_key: str, secret_key: str, region: str = "auto", s3=None):
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        self.engine = create_engine(database_url, pool_pre_ping=True, pool_recycle=180)
        self.Session = sessionmaker(self.engine, expire_on_commit=False)
        self.bucket = bucket
        self.s3 = s3 or boto3.client(
            "s3", endpoint_url=endpoint, region_name=region,
            aws_access_key_id=access_key, aws_secret_access_key=secret_key,
            config=S3Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        Base.metadata.create_all(self.engine)

    def account(self, token: str | None):
        if not token or len(token) > 128:
            return None
        key = sha256(token.encode("utf-8")).hexdigest()
        with self.Session() as db:
            row = db.get(LoginSession, key)
            if not row or row.expires_at.replace(tzinfo=timezone.utc) <= utcnow():
                return None
            return db.get(Account, row.account_id)

    def login(self, email: str, password: str, *, register: bool):
        email = email.strip().lower()
        with self.Session.begin() as db:
            account = db.scalar(select(Account).where(Account.email == email))
            if register:
                if len(password) < 12 or password.isspace():
                    raise HTTPException(422, "La contraseña debe tener al menos 12 caracteres.")
                if account is not None:
                    raise HTTPException(409, "Ya existe una cuenta con este correo.")
                account = Account(id=str(uuid4()), email=email, password_hash=_hasher.hash(password))
                db.add(account)
                db.flush()
            else:
                try:
                    valid = account is not None and _hasher.verify(account.password_hash, password)
                except (InvalidHashError, VerifyMismatchError, VerificationError):
                    valid = False
                if not valid:
                    raise HTTPException(401, "Correo o contraseña incorrectos.")
                if _hasher.check_needs_rehash(account.password_hash):
                    account.password_hash = _hasher.hash(password)
            token = secrets.token_urlsafe(48)
            db.add(LoginSession(
                token_hash=sha256(token.encode()).hexdigest(),
                account_id=account.id, expires_at=utcnow() + timedelta(days=SESSION_DAYS)))
            return {"id": account.id, "email": account.email}, token

    def logout(self, token: str | None):
        if token:
            with self.Session.begin() as db:
                db.execute(delete(LoginSession).where(LoginSession.token_hash == sha256(token.encode()).hexdigest()))

    def list_scans(self, account_id: str, kind: str, limit: int):
        with self.Session() as db:
            scans = db.scalars(select(Scan).where(
                Scan.account_id == account_id, Scan.kind == kind
            ).order_by(Scan.created_at.desc(), Scan.id.desc()).limit(limit)).all()
            return [self.public_scan(s) for s in scans]

    @staticmethod
    def public_scan(s: Scan):
        return {
            "id": s.id, "name": s.name, "label": s.label,
            "confidence": s.confidence, "inference_time_ms": s.inference_time_ms,
            "timestamp": s.created_at.isoformat(),
        }

    def get_scan(self, account_id: str, scan_id: str, kind: str):
        with self.Session() as db:
            scan = db.get(Scan, scan_id)
            if scan is None or scan.account_id != account_id or scan.kind != kind:
                raise HTTPException(404, "Registro no encontrado.")
            return scan

    def image(self, scan: Scan):
        try:
            obj = self.s3.get_object(Bucket=self.bucket, Key=scan.image_key)
            return obj["Body"].read()
        except Exception as exc:
            logger.exception("Could not load private scan photo")
            raise HTTPException(503, "No se pudo recuperar la fotografía.") from exc

    @staticmethod
    def prepare_photo(raw: bytes):
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "La fotografía supera el límite de 5 MB.")
        try:
            with Image.open(BytesIO(raw)) as opened:
                if opened.width * opened.height > 20_000_000:
                    raise HTTPException(413, "La imagen supera el límite de píxeles.")
                opened.load()
                image = ImageOps.exif_transpose(opened).convert("RGB")
                image.thumbnail((1024, 1024))
                out = BytesIO()
                image.save(out, format="JPEG", quality=78, optimize=True)
                return out.getvalue()
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise HTTPException(400, "Imagen JPG, PNG o WebP inválida.") from exc

    def store(self, account_id: str, kind: str, raw: bytes, name: str, prediction):
        if kind == "rejection" and prediction.label != "NO APTO":
            return None
        photo = self.prepare_photo(raw)
        scan_id = str(uuid4())
        image_key = f"{account_id}/{kind}/{scan_id}.jpg"
        try:
            self.s3.put_object(Bucket=self.bucket, Key=image_key, Body=photo, ContentType="image/jpeg")
        except Exception as exc:
            logger.exception("Could not store private scan photo")
            raise HTTPException(503, "No se pudo guardar la fotografía en la nube.") from exc

        obsolete = []
        try:
            with self.Session.begin() as db:
                # Serialize per-account insert and pruning, including simultaneous uploads.
                db.scalar(select(Account).where(Account.id == account_id).with_for_update())
                scan = Scan(
                    id=scan_id, account_id=account_id, kind=kind,
                    name=(name or "Captura de cámara")[:200],
                    label=prediction.label, confidence=prediction.confidence,
                    inference_time_ms=prediction.inference_time_ms,
                    result=prediction.model_dump(mode="json"),
                    image_key=image_key, created_at=utcnow())
                db.add(scan)
                db.flush()
                keep = MAX_ANALYSES if kind == "analysis" else MAX_REJECTIONS
                excess = db.scalars(select(Scan).where(
                    Scan.account_id == account_id, Scan.kind == kind
                ).order_by(Scan.created_at.desc(), Scan.id.desc()).offset(keep)).all()
                obsolete = [row.image_key for row in excess]
                for row in excess:
                    db.delete(row)
        except Exception:
            self._delete_image(image_key)
            raise
        for key in obsolete:
            self._delete_image(key)
        return scan_id

    def _delete_image(self, key: str):
        try:
            self.s3.delete_object(Bucket=self.bucket, Key=key)
        except Exception:
            logger.warning("Photo cleanup failed, key=%s", key)

    def remove_scans(self, account_id: str, kind: str, scan_id: str | None = None):
        with self.Session.begin() as db:
            query = select(Scan).where(Scan.account_id == account_id, Scan.kind == kind)
            if scan_id is not None:
                query = query.where(Scan.id == scan_id)
            scans = db.scalars(query).all()
            keys = [s.image_key for s in scans]
            for s in scans:
                db.delete(s)
        for key in keys:
            self._delete_image(key)
        return len(keys)

    def delete_account(self, account_id: str):
        with self.Session.begin() as db:
            scans = db.scalars(select(Scan).where(Scan.account_id == account_id)).all()
            keys = [s.image_key for s in scans]
            db.execute(delete(LoginSession).where(LoginSession.account_id == account_id))
            for scan in scans:
                db.delete(scan)
            db.execute(delete(Account).where(Account.id == account_id))
        for key in keys:
            self._delete_image(key)


def create_cloud_from_environment():
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return None
    variables = {
        "bucket": os.getenv("BV_S3_BUCKET", ""),
        "endpoint": os.getenv("BV_S3_ENDPOINT", ""),
        "access_key": os.getenv("BV_S3_ACCESS_KEY", ""),
        "secret_key": os.getenv("BV_S3_SECRET_KEY", ""),
        "region": os.getenv("BV_S3_REGION", "auto"),
    }
    if not all((variables["bucket"], variables["endpoint"],
                variables["access_key"], variables["secret_key"])):
        raise RuntimeError("Database is configured without private image bucket variables")
    return CloudService(url, **variables)


def service(request: Request) -> CloudService:
    svc = getattr(request.app.state, "cloud", None)
    if svc is None:
        raise HTTPException(503, "El almacenamiento en la nube no está disponible.")
    return svc


def current_account(request: Request, svc: CloudService = Depends(service)):
    account = svc.account(request.cookies.get(COOKIE))
    if account is None:
        raise HTTPException(401, "Inicia sesión para guardar y consultar tu información.")
    return account


def guard_origin(request: Request):
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origin = request.headers.get("origin")
    expected = os.getenv("PUBLIC_ORIGIN", "").rstrip("/")
    if not expected:
        expected = str(request.base_url).rstrip("/")
    if origin and origin.rstrip("/") != expected:
        raise HTTPException(403, "Origen de solicitud no autorizado.")
    if not origin and request.headers.get("cookie"):
        raise HTTPException(403, "Falta el encabezado Origin.")


def limit_auth(request: Request):
    host = request.client.host if request.client else "unknown"
    key = host + ":" + request.url.path
    now = time.monotonic()
    with _rate_lock:
        q = _rate[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= 12:
            raise HTTPException(429, "Demasiados intentos. Espera un minuto.")
        q.append(now)


def set_cookie(response: Response, token: str, request: Request):
    secure = os.getenv("PUBLIC_ORIGIN", "").startswith("https://") or request.url.scheme == "https"
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True,
                        secure=secure, samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/cloud", tags=["Cuenta e historial en la nube"],
                   dependencies=[Depends(guard_origin)])


@router.get("/me")
def whoami(request: Request):
    svc = getattr(request.app.state, "cloud", None)
    if svc is None:
        return {"enabled": False, "user": None}
    account = svc.account(request.cookies.get(COOKIE))
    return JSONResponse({"enabled": True, "user": (
        {"id": account.id, "email": account.email} if account else None
    )}, headers={"Cache-Control": "no-store"})


@router.post("/register")
def register(body: Credentials, request: Request, response: Response,
             svc: CloudService = Depends(service), _=Depends(limit_auth)):
    if os.getenv("BV_SIGNUP_ENABLED", "true").lower() != "true":
        raise HTTPException(403, "El registro de nuevas cuentas está desactivado.")
    user, token = svc.login(body.email, body.password, register=True)
    set_cookie(response, token, request)
    return {"user": user}


@router.post("/login")
def login(body: Credentials, request: Request, response: Response,
          svc: CloudService = Depends(service), _=Depends(limit_auth)):
    user, token = svc.login(body.email, body.password, register=False)
    set_cookie(response, token, request)
    return {"user": user}


@router.post("/logout")
def logout(request: Request, response: Response, svc: CloudService = Depends(service)):
    svc.logout(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    response.headers["Cache-Control"] = "no-store"
    return {"ok": True}


@router.get("/history")
def history(account: Account = Depends(current_account), svc: CloudService = Depends(service)):
    return JSONResponse(svc.list_scans(account.id, "analysis", MAX_ANALYSES),
                        headers={"Cache-Control": "no-store"})


@router.get("/history/{scan_id}")
def history_detail(scan_id: UUID, account: Account = Depends(current_account),
                   svc: CloudService = Depends(service)):
    scan = svc.get_scan(account.id, str(scan_id), "analysis")
    return JSONResponse({"id": scan.id, "data": scan.result},
                        headers={"Cache-Control": "no-store"})


@router.get("/history/{scan_id}/image")
def history_image(scan_id: UUID, account: Account = Depends(current_account),
                  svc: CloudService = Depends(service)):
    scan = svc.get_scan(account.id, str(scan_id), "analysis")
    return Response(svc.image(scan), media_type="image/jpeg",
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.delete("/history")
def history_clear(account: Account = Depends(current_account),
                  svc: CloudService = Depends(service)):
    return {"deleted": svc.remove_scans(account.id, "analysis")}


@router.get("/rejections")
def rejections(limit: int = 50, account: Account = Depends(current_account),
               svc: CloudService = Depends(service)):
    limit = max(1, min(MAX_REJECTIONS, limit))
    items = svc.list_scans(account.id, "rejection", MAX_REJECTIONS)
    return JSONResponse({"items": items[:limit], "total": len(items)},
                        headers={"Cache-Control": "no-store"})


@router.get("/rejections/{scan_id}/image")
def rejection_image(scan_id: UUID, account: Account = Depends(current_account),
                    svc: CloudService = Depends(service)):
    scan = svc.get_scan(account.id, str(scan_id), "rejection")
    return Response(svc.image(scan), media_type="image/jpeg",
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.delete("/rejections/{scan_id}")
def rejection_delete(scan_id: UUID, account: Account = Depends(current_account),
                     svc: CloudService = Depends(service)):
    return {"deleted": svc.remove_scans(account.id, "rejection", str(scan_id))}


@router.delete("/rejections")
def rejection_clear(account: Account = Depends(current_account),
                    svc: CloudService = Depends(service)):
    return {"deleted": svc.remove_scans(account.id, "rejection")}


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


@router.post("/delete-account")
def delete_account(body: DeleteAccountRequest, response: Response,
                   account: Account = Depends(current_account),
                   svc: CloudService = Depends(service)):
    try:
        if not _hasher.verify(account.password_hash, body.password):
            raise HTTPException(403, "Contraseña incorrecta.")
    except (InvalidHashError, VerifyMismatchError, VerificationError) as exc:
        raise HTTPException(403, "Contraseña incorrecta.") from exc
    svc.delete_account(account.id)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}
