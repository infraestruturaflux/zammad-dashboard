from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=False)
    number:         Mapped[str]           = mapped_column(String(32),  unique=True, index=True)
    title:          Mapped[str]           = mapped_column(Text,        default="")
    state_id:       Mapped[int]           = mapped_column(Integer,     default=0)
    state:          Mapped[str]           = mapped_column(String(64),  default="", index=True)
    priority_id:    Mapped[int]           = mapped_column(Integer,     default=0)
    priority:       Mapped[str]           = mapped_column(String(64),  default="", index=True)
    group_id:       Mapped[int]           = mapped_column(Integer,     default=0)
    group:          Mapped[str | None]    = mapped_column(String(128), nullable=True)
    owner_id:       Mapped[int | None]    = mapped_column(Integer,     nullable=True)
    owner:          Mapped[str | None]    = mapped_column(String(128), nullable=True)
    customer_id:    Mapped[int]           = mapped_column(Integer,     default=0)
    customer:       Mapped[str | None]    = mapped_column(String(256), nullable=True)
    created_at:     Mapped[datetime | None] = mapped_column(DateTime,  nullable=True)
    updated_at:     Mapped[datetime | None] = mapped_column(DateTime,  nullable=True, index=True)
    close_at:       Mapped[datetime | None] = mapped_column(DateTime,  nullable=True)
    sla_response_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sla_solution_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    frt_seconds:    Mapped[int | None]    = mapped_column(Integer,     nullable=True)
    # Destinatário (campo "To" do 1º email) — usado para filtrar encaminhamentos
    # a caixas de sistema (ex: portabilidade@flux.net.br) do Top Ofensores.
    recipient:      Mapped[str | None]    = mapped_column(String(512), nullable=True)

    __table_args__ = (
        Index("ix_tickets_state_updated", "state", "updated_at"),
    )


class SyncMeta(Base):
    __tablename__ = "sync_meta"

    key:   Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
