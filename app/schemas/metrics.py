from pydantic import BaseModel


class TopOffenderItem(BaseModel):
    name: str
    ticket_count: int
    priority_breakdown: dict[str, int]


class TopOffendersResponse(BaseModel):
    by: str
    start_date: str
    end_date: str
    items: list[TopOffenderItem]


class HeatmapCell(BaseModel):
    day: int
    hour: int
    count: int


class HeatmapResponse(BaseModel):
    start_date: str
    end_date: str
    max_count: int
    days_labels: list[str]
    data: list[HeatmapCell]


class FRTStats(BaseModel):
    count: int
    period_days: int
    mean_seconds: float
    mean_formatted: str
    p50_seconds: float
    p50_formatted: str
    p90_seconds: float
    p90_formatted: str
    p95_seconds: float
    p95_formatted: str


class FRTToday(BaseModel):
    date: str
    count: int
    mean_seconds: float
    mean_formatted: str
    p50_seconds: float
    p50_formatted: str
    p95_seconds: float
    p95_formatted: str
    status: str  # "good" | "warning" | "critical"


class AnalystLoadItem(BaseModel):
    owner: str
    ticket_count: int


class AnalystLoadResponse(BaseModel):
    items: list[AnalystLoadItem]


# ── Detalhe diário por analista ───────────────────────────────────────────────

class DayTicket(BaseModel):
    number: str
    title: str
    state: str


class AnalystDayItem(BaseModel):
    owner: str
    ticket_count: int
    tickets: list[DayTicket]


class AnalystDayDetailResponse(BaseModel):
    date: str
    analysts: list[AnalystDayItem]
    total: int


# ── Detalhe de Top Ofensor ────────────────────────────────────────────────────

class OffenderTicket(BaseModel):
    number: str
    title: str
    state: str
    priority: str
    owner: str | None


class TopOffenderDetailResponse(BaseModel):
    by: str
    name: str
    start_date: str
    end_date: str
    tickets: list[OffenderTicket]
    total: int


# ── Journey (MTTR / MTTA / Handoffs) ─────────────────────────────────────────

class TimeMetric(BaseModel):
    wall_h:   float | None
    biz_h:    float | None
    wall_fmt: str
    biz_fmt:  str


class HandoffItem(BaseModel):
    name:     str
    type:     str   # "analyst" | "waiting"
    wall_h:   float
    biz_h:    float
    wall_fmt: str
    biz_fmt:  str


class TimelineSegment(BaseModel):
    start:    str
    end:      str
    owner:    str
    state:    str
    category: str   # "com_analista" | "aguardando_cliente" | "aguardando_terceiros" | "sem_dono"
    wall_h:   float
    biz_h:    float
    wall_fmt: str
    biz_fmt:  str


class TicketJourneyResponse(BaseModel):
    ticket_id:  int
    number:     str | None
    title:      str | None
    state:      str | None
    owner:      str | None
    created_at: str | None
    closed_at:  str | None
    mttr:       TimeMetric
    mtta:       TimeMetric
    handoffs:   list[HandoffItem]
    timeline:   list[TimelineSegment]


class MTTRStatsResponse(BaseModel):
    count:          int
    start_date:     str
    end_date:       str
    wall_mean_h:    float | None = None
    wall_p50_h:     float | None = None
    wall_p90_h:     float | None = None
    wall_p95_h:     float | None = None
    wall_mean_fmt:  str | None   = None
    wall_p50_fmt:   str | None   = None
    wall_p90_fmt:   str | None   = None
    biz_mean_h:     float | None = None
    biz_p50_h:      float | None = None
    biz_p90_h:      float | None = None
    biz_p95_h:      float | None = None
    biz_mean_fmt:   str | None   = None
    biz_p50_fmt:    str | None   = None
    biz_p90_fmt:    str | None   = None


class MTTAStatsResponse(MTTRStatsResponse):
    note: str | None = None


# ── Volume por status ─────────────────────────────────────────────────────────

class StatusBlock(BaseModel):
    total:    int
    by_state: dict[str, int]


class VolumeByStatusResponse(BaseModel):
    start_date: str
    end_date:   str
    entrantes:  StatusBlock
    saintes:    StatusBlock


# ── Desempenho por analista ───────────────────────────────────────────────────

class AnalystPerformanceItem(BaseModel):
    owner:         str
    tickets_count: int
    # ── Horas úteis ──
    active_biz_h:       float
    active_fmt:         str
    ag_cliente_biz_h:   float | None = None
    ag_cliente_fmt:     str | None   = None
    ag_terceiros_biz_h: float | None = None
    ag_terceiros_fmt:   str | None   = None
    waiting_biz_h:      float
    waiting_fmt:        str
    # ── Horas corridas ──
    active_wall_h:       float | None = None
    active_wall_fmt:     str | None   = None
    ag_cliente_wall_h:   float | None = None
    ag_cliente_wall_fmt: str | None   = None
    ag_terceiros_wall_h: float | None = None
    ag_terceiros_wall_fmt: str | None = None
    waiting_wall_h:      float | None = None
    waiting_wall_fmt:    str | None   = None
    # ── FCR ──
    fcr_pct:        int | None = None


class AnalystPerformanceResponse(BaseModel):
    start_date: str
    end_date:   str
    analysts:   list[AnalystPerformanceItem]
