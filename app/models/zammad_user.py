"""
Modelo dos usuários (agentes) do Zammad — usado para filtrar analistas ativos.

Sincronizado de GET /api/v1/users. O campo `active` reflete se o usuário
está ativo no Zammad; quando alguém é desativado lá, deixa de aparecer nas
métricas de desempenho automaticamente.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ZammadUser(Base):
    __tablename__ = "zammad_users"

    id:         Mapped[int]             = mapped_column(Integer,     primary_key=True, autoincrement=False)
    email:      Mapped[str | None]      = mapped_column(String(256), nullable=True, index=True)
    login:      Mapped[str | None]      = mapped_column(String(256), nullable=True)
    name:       Mapped[str | None]      = mapped_column(String(256), nullable=True, index=True)  # "Firstname Lastname"
    active:     Mapped[bool]            = mapped_column(Boolean,     default=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime,    nullable=True)
