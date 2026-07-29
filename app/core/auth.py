"""Utilitários de autenticação — JWT + bcrypt."""
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings

_bearer = HTTPBearer(auto_error=False)


# ── Senhas ────────────────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    """Verifica senha em texto puro contra hash bcrypt."""
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── Tokens JWT ────────────────────────────────────────────────────────────────

def create_access_token(subject: str) -> str:
    """Cria um JWT assinado com expiração configurável."""
    cfg = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(hours=cfg.jwt_expire_hours)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, cfg.jwt_secret, algorithm=cfg.jwt_algorithm)


def _decode_token(token: str) -> dict:
    cfg = get_settings()
    return jwt.decode(token, cfg.jwt_secret, algorithms=[cfg.jwt_algorithm])


# ── Dependência FastAPI ───────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Dependência que valida o Bearer token e retorna o 'sub' (username)."""
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise exc
    try:
        payload = _decode_token(credentials.credentials)
        sub: str | None = payload.get("sub")
        if not sub:
            raise exc
        return sub
    except JWTError:
        raise exc
