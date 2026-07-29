"""
Modelo para eventos de histórico dos tickets (rastreado via API do Zammad).

Cada linha representa uma mudança registrada no ticket:
  • state   — transição de estado (new → open → aguardando_cliente → ...)
  • owner   — mudança de responsável (atribuição / handoff)

O campo `id` é o ID nativo do Zammad (globalmente único), usado como PK
para que INSERT OR IGNORE seja idempotente no sync incremental.
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TicketEvent(Base):
    __tablename__ = "ticket_events"

    id:          Mapped[int]             = mapped_column(Integer,     primary_key=True, autoincrement=False)
    ticket_id:   Mapped[int]             = mapped_column(Integer,     nullable=False, index=True)
    event_type:  Mapped[str]             = mapped_column(String(32),  default="")    # "created" | "updated"
    field:       Mapped[str | None]      = mapped_column(String(64),  nullable=True) # "state" | "owner" | "owner_id"
    value_from:  Mapped[str | None]      = mapped_column(String(512), nullable=True)
    value_to:    Mapped[str | None]      = mapped_column(String(512), nullable=True)
    created_at:  Mapped[datetime | None] = mapped_column(DateTime,    nullable=True)
    created_by:  Mapped[str | None]      = mapped_column(String(256), nullable=True)

    __table_args__ = (
        Index("ix_ticket_events_ticket_ts", "ticket_id", "created_at"),
    )
