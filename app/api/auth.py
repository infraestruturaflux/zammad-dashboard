"""Endpoint de autenticação — POST /auth/login."""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.auth import create_access_token, verify_password
from app.core.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    """Autentica com usuário/senha e retorna um JWT de acesso."""
    cfg = get_settings()

    username_ok = body.username.lower().strip() == cfg.noc_username.lower().strip()
    password_ok = verify_password(body.password, cfg.noc_password_hash)

    if not (username_ok and password_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos.",
        )

    token = create_access_token(subject=cfg.noc_username)
    return TokenResponse(access_token=token)
