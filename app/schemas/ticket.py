from datetime import datetime

from pydantic import BaseModel, ConfigDict


class QueueSummary(BaseModel):
    chamados_abertos:      int
    em_atendimento:        int
    aguardando_cliente:    int
    aguardando_terceiros:  int
    resolvidos_hoje:       int
    fechados_hoje:         int
    synced_at: datetime | None
    trend_chamados_abertos:     float | None = None
    trend_em_atendimento:       float | None = None
    trend_aguardando_cliente:   float | None = None
    trend_aguardando_terceiros: float | None = None
    trend_resolvidos_hoje:      float | None = None
    trend_fechados_hoje:        float | None = None


class SLAAlert(BaseModel):
    ticket_id: int
    number: str
    title: str
    priority: str
    customer: str | None
    group: str | None
    sla_deadline: datetime
    minutes_remaining: float
    breach_type: str  # "response" | "solution"


class SLAAlertList(BaseModel):
    alerts: list[SLAAlert]
    count: int


class ZombieTicket(BaseModel):
    ticket_id: int
    number: str
    title: str
    owner: str | None
    group: str | None
    days_idle: float
    updated_at: datetime


class ZombieList(BaseModel):
    zombies: list[ZombieTicket]
    count: int
    idle_days_threshold: int


class UrgentTicket(BaseModel):
    ticket_id: int
    number: str
    title: str
    customer: str | None
    group: str | None
    owner: str | None
    created_at: datetime


class UrgentList(BaseModel):
    tickets: list[UrgentTicket]
    count: int


class SyncStatus(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: str
    tickets_upserted: int
    last_sync_at: datetime | None
    duration_seconds: float


class ActivityEvent(BaseModel):
    ticket_id: int
    number: str
    title: str
    event_type: str        # "created" | "updated" | "closed"
    actor: str | None
    state: str
    happened_at: datetime


class ActivityFeed(BaseModel):
    events: list[ActivityEvent]
    count: int


class VIPTicket(BaseModel):
    ticket_id: int
    number: str
    title: str
    customer: str
    state: str
    priority: str
    owner: str | None
    created_at: datetime


class VIPRadarResponse(BaseModel):
    tickets: list[VIPTicket]
    count: int
    vip_customers: list[str]


class HistoryPoint(BaseModel):
    date: str
    chamados_abertos:     int
    em_atendimento:       int
    aguardando_cliente:   int
    aguardando_terceiros: int
    resolvidos_hoje:      int
    fechados_hoje:        int


class HistoryResponse(BaseModel):
    points: list[HistoryPoint]
    days: int


# ── Feed de Chamados do Dia ────────────────────────────────────────────────────

class TodayTicket(BaseModel):
    ticket_id: int
    number: str
    title: str
    state: str
    owner: str | None
    group: str | None
    created_at: datetime


class TodayFeed(BaseModel):
    tickets: list[TodayTicket]
    count: int
    date: str  # YYYY-MM-DD


# ── Carga por Analista — Dia Atual ─────────────────────────────────────────────

class AnalystTodayItem(BaseModel):
    owner: str
    ticket_count: int


class AnalystLoadTodayResponse(BaseModel):
    items: list[AnalystTodayItem]
    date: str   # YYYY-MM-DD
    total: int


# ── Equipe Ativa Agora ─────────────────────────────────────────────────────────

class TeamMemberNow(BaseModel):
    owner: str
    active_count: int   # tickets atualmente "Em atendimento" / "Escalonado DEV"


class TeamNowResponse(BaseModel):
    members: list[TeamMemberNow]
    total_tickets: int  # soma de todos os tickets ativos da equipe agora
