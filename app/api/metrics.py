import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from sqlalchemy import and_, func, or_, select, text

from app.api.noc import (
    _STATE_AG_CLIENTE,
    _STATE_AG_TERCEIROS,
    _not_excluded_analyst,
    _not_excluded_group,
    _owner_is_phantom,
    _owner_is_real,
)
from app.core.database import AsyncSessionLocal
from app.models.ticket import Ticket
from app.schemas.metrics import (
    AnalystDayDetailResponse,
    AnalystLoadResponse,
    AnalystPerformanceResponse,
    AnalystTicket,
    AnalystTicketsResponse,
    FRTStats,
    FRTToday,
    HeatmapResponse,
    MTTAStatsResponse,
    MTTRStatsResponse,
    TeamStatusItem,
    TeamStatusResponse,
    TicketJourneyResponse,
    TopOffenderDetailResponse,
    TopOffendersResponse,
    VolumeByStatusResponse,
)
from app.services.cache import noc_cache
from app.services.metrics import (
    compute_analyst_day_detail,
    compute_analyst_load,
    compute_daily_volume,
    compute_frt_stats,
    compute_frt_today,
    compute_heatmap,
    compute_top_offender_detail,
    compute_top_offenders,
    generate_excel_report,
)
from app.services.metrics_journey import (
    compute_analyst_performance,
    compute_history_range,
    compute_mtta_stats,
    compute_mttr_history,
    compute_mttr_stats,
    compute_sla_history,
    compute_sla_stats,
    compute_ticket_journey,
    compute_volume_by_group,
    compute_volume_by_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/top-offenders", response_model=TopOffendersResponse, summary="Top clientes/grupos por volume")
async def top_offenders(
    by: str = Query("customer", pattern="^(customer|group)$"),
    start_date: str | None = Query(None),
    end_date:   str | None = Query(None),
    limit: int = Query(5, ge=1, le=20),
):
    cache_key = f"top_offenders:{by}:{start_date}:{end_date}:{limit}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_top_offenders(by=by, start_date=start_date, end_date=end_date, limit=limit)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/top-offender-detail", response_model=TopOffenderDetailResponse, summary="Tickets de um cliente ou grupo")
async def top_offender_detail(
    by:         str            = Query("customer", pattern="^(customer|group)$"),
    name:       str            = Query(...),
    start_date: str | None     = Query(None),
    end_date:   str | None     = Query(None),
):
    cache_key = f"top_offender_detail:{by}:{name}:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_top_offender_detail(by=by, name=name, start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=120)
    return result


@router.get("/heatmap", response_model=HeatmapResponse, summary="Heatmap de volume — dia × hora")
async def heatmap(
    start_date: str | None = Query(None),
    end_date:   str | None = Query(None),
):
    cache_key = f"heatmap:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_heatmap(start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/frt", response_model=FRTStats, summary="FRT histórico (percentis)")
async def frt_stats(days: int = Query(30, ge=1, le=365)):
    cache_key = f"frt_stats:{days}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_frt_stats(days=days)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/frt/today", response_model=FRTToday, summary="FRT dos chamados criados hoje")
async def frt_today():
    cached = noc_cache.get("frt_today")
    if cached is not None:
        return cached
    result = compute_frt_today()
    noc_cache.set("frt_today", result, ttl=90)
    return result


@router.get("/analyst-load", response_model=AnalystLoadResponse, summary="Carga por analista (histórico)")
async def analyst_load(
    start_date: str | None = Query(None),
    end_date:   str | None = Query(None),
    month:      str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
):
    cache_key = f"analyst_load:{month}:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_analyst_load(start_date=start_date, end_date=end_date, month=month)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/analyst-day-detail", response_model=AnalystDayDetailResponse, summary="Tickets por analista num dia")
async def analyst_day_detail(
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    cache_key = f"analyst_day_detail:{date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_analyst_day_detail(date=date)
    ttl = 60 if date >= datetime.now(timezone.utc).date().isoformat() else 3600
    noc_cache.set(cache_key, result, ttl=ttl)
    return result


@router.get("/daily-volume", summary="Tickets criados/resolvidos/fechados por dia")
async def daily_volume(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    owner: str | None = Query(None),
):
    cache_key = f"daily_volume:{month}:{owner}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_daily_volume(month=month, owner=owner)
    ttl = 300 if owner else 120
    noc_cache.set(cache_key, result, ttl=ttl)
    return result


@router.get("/journey/{ticket_id}", response_model=TicketJourneyResponse,
            summary="Jornada completa de um ticket (MTTR, MTTA, handoffs, timeline)")
async def ticket_journey(ticket_id: int):
    cache_key = f"journey:{ticket_id}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_ticket_journey(ticket_id=ticket_id)
    if "error" in result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=result["error"])
    noc_cache.set(cache_key, result, ttl=120)
    return result


@router.get("/mttr", response_model=MTTRStatsResponse,
            summary="Estatísticas de MTTR (horas corridas e úteis) no período")
async def mttr_stats(
    start_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    month:      str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
):
    if month:
        from calendar import monthrange
        y, m = map(int, month.split("-"))
        start_date = f"{month}-01"
        end_date   = f"{month}-{monthrange(y, m)[1]:02d}"
    cache_key = f"mttr_stats:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_mttr_stats(start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/mtta", response_model=MTTAStatsResponse,
            summary="Estatísticas de MTTA (tempo de fila / primeira resposta) no período")
async def mtta_stats(
    start_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    month:      str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
):
    if month:
        from calendar import monthrange
        y, m = map(int, month.split("-"))
        start_date = f"{month}-01"
        end_date   = f"{month}-{monthrange(y, m)[1]:02d}"
    cache_key = f"mtta_stats:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_mtta_stats(start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/sla-stats", summary="% de chamados resolvidos dentro do prazo SLA no período")
async def sla_stats(
    start_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    month:      str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
):
    if month:
        from calendar import monthrange
        y, m = map(int, month.split("-"))
        start_date = f"{month}-01"
        end_date   = f"{month}-{monthrange(y, m)[1]:02d}"
    cache_key = f"sla_stats:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_sla_stats(start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/volume-status", response_model=VolumeByStatusResponse,
            summary="Tickets do período por status (entrantes criados / saintes fechados)")
async def volume_by_status(
    start_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    month:      str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
):
    if month:
        from calendar import monthrange
        y, m = map(int, month.split("-"))
        start_date = f"{month}-01"
        end_date   = f"{month}-{monthrange(y, m)[1]:02d}"
    cache_key = f"volume_status:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_volume_by_status(start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/mttr-history", summary="MTTR mensal dos últimos N meses (para mini-gráfico)")
async def mttr_history(months: int = Query(6, ge=2, le=24)):
    cache_key = f"mttr_history:{months}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_mttr_history(months_count=months)
    noc_cache.set(cache_key, result, ttl=3600)  # 1h — dado histórico muda pouco
    return result


@router.get("/sla-history", summary="SLA % mensal dos últimos N meses (para mini-gráfico)")
async def sla_history(months: int = Query(6, ge=2, le=24)):
    cache_key = f"sla_history:{months}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_sla_history(months_count=months)
    noc_cache.set(cache_key, result, ttl=3600)
    return result


@router.get("/history-range", summary="Histórico de uma métrica em intervalo de datas (bucketing automático)")
async def history_range(
    metric:     str = Query(..., pattern="^(mttr|mtta|sla|volume)$"),
    start_date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    cache_key = f"history_range:{metric}:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_history_range(metric=metric, start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=900)
    return result


@router.get("/volume-by-group", summary="Tickets do período agrupados por Grupo do Zammad")
async def volume_by_group(
    start_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    month:      str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
):
    if month:
        from calendar import monthrange
        y, m = map(int, month.split("-"))
        start_date = f"{month}-01"
        end_date   = f"{month}-{monthrange(y, m)[1]:02d}"
    cache_key = f"volume_by_group:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_volume_by_group(start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/volume-status-detail", summary="Tickets de um status no período (filtro por grupo opcional)")
async def volume_status_detail(
    status:     str            = Query(...),
    group:      str | None     = Query(None),          # filtro opcional por grupo
    month:      str | None     = Query(None, pattern=r"^\d{4}-\d{2}$"),
    start_date: str | None     = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str | None     = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    from app.services.metrics_journey import _resolve, _map_state, _sync_engine
    from sqlalchemy import text as _text
    import pandas as _pd

    if month:
        from calendar import monthrange
        y, m = map(int, month.split("-"))
        start_date = f"{month}-01"
        end_date   = f"{month}-{monthrange(y, m)[1]:02d}"

    start_s, end_s = _resolve(start_date, end_date)
    engine = _sync_engine()

    df = _pd.read_sql(
        _text("""
            SELECT number, title, state, priority, owner, "group", customer
            FROM tickets
            WHERE datetime(created_at) >= datetime(:start)
              AND datetime(created_at) <= datetime(:end)
            ORDER BY CAST(number AS INTEGER) DESC
        """),
        con=engine, params={"start": start_s, "end": end_s},
    )

    # Filtra por estado canônico
    df = df[df["state"].apply(lambda s: _map_state(s) == status)]

    # Filtra por grupo se informado
    if group:
        df = df[df["group"].str.strip() == group.strip()]

    tickets = df.fillna("").to_dict(orient="records")
    return {"group": group, "status": status, "tickets": tickets, "total": len(tickets)}


@router.get("/analyst-performance", response_model=AnalystPerformanceResponse,
            summary="Desempenho por analista: tickets, tempo ativo e em espera (horas úteis)")
async def analyst_performance(
    start_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    month:      str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
):
    if month:
        from calendar import monthrange
        y, m = map(int, month.split("-"))
        start_date = f"{month}-01"
        end_date   = f"{month}-{monthrange(y, m)[1]:02d}"
    cache_key = f"analyst_perf:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached
    result = compute_analyst_performance(start_date=start_date, end_date=end_date)
    noc_cache.set(cache_key, result, ttl=300)
    return result


# ── Situação atual da equipe (snapshot por analista × estado) ─────────────────

_EM_ATEND_STATES = frozenset({"em atendimento"})
_ESCAL_STATES    = frozenset({"escalonado dev", "escalonado rotas", "escalonado infra"})
_ACTIVE_STATES   = _EM_ATEND_STATES | _ESCAL_STATES | _STATE_AG_CLIENTE | _STATE_AG_TERCEIROS


def _pretty_owner(owner: str) -> str:
    """Fallback: e-mail → nome title-case quando não há registro em zammad_users."""
    local = owner.split("@")[0] if "@" in owner else owner
    return " ".join(w.capitalize() for w in re.split(r"[._\s-]+", local) if w) or owner


def _state_bucket(state_lower: str) -> str | None:
    if state_lower in _EM_ATEND_STATES:
        return "em_atend"
    if state_lower in _ESCAL_STATES:
        return "escal_dev"
    if state_lower in _STATE_AG_CLIENTE:
        return "ag_cliente"
    if state_lower in _STATE_AG_TERCEIROS:
        return "ag_terceiros"
    return None


@router.get("/team-status", response_model=TeamStatusResponse,
            summary="Situação atual: tickets ativos por analista × estado")
async def team_status():
    cached = noc_cache.get("team_status")
    if cached is not None:
        return cached

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket.owner, func.lower(Ticket.state), func.count(Ticket.id))
            .where(
                func.lower(Ticket.state).in_(list(_ACTIVE_STATES)),
                _owner_is_real(),
                func.lower(func.trim(Ticket.owner)).notlike("auto-%"),
                _not_excluded_group(),
                _not_excluded_analyst(),
            )
            .group_by(Ticket.owner, func.lower(Ticket.state))
        )
        agg: dict[str, dict[str, int]] = {}
        for owner, state_lower, cnt in rows:
            bucket = _state_bucket(state_lower)
            if bucket is None:
                continue
            d = agg.setdefault(owner, {"em_atend": 0, "escal_dev": 0, "ag_cliente": 0, "ag_terceiros": 0})
            d[bucket] += cnt

        # Mapa e-mail → nome de exibição do Zammad (mesma fonte do analyst-performance)
        urows = await session.execute(text("SELECT lower(email) AS e, name FROM zammad_users"))
        namemap = {e: n for e, n in urows if n}

    analysts = [
        TeamStatusItem(
            owner=owner,
            name=namemap.get((owner or "").strip().lower()) or _pretty_owner(owner or ""),
            total=sum(d.values()), **d,
        )
        for owner, d in agg.items()
    ]
    analysts.sort(key=lambda a: a.total, reverse=True)
    result = TeamStatusResponse(analysts=analysts, total=sum(a.total for a in analysts))
    noc_cache.set("team_status", result, ttl=20)
    return result


@router.get("/analyst-tickets", response_model=AnalystTicketsResponse,
            summary="Tickets ativos atualmente atribuídos a um analista")
async def analyst_tickets(owner: str = Query(..., description="E-mail do analista (owner)")):
    cache_key = f"analyst_tickets:{owner.strip().lower()}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket.number, Ticket.title, Ticket.state)
            .where(
                func.lower(func.trim(Ticket.owner)) == owner.strip().lower(),
                func.lower(Ticket.state).in_(list(_ACTIVE_STATES)),
                _not_excluded_group(),
            )
            .order_by(Ticket.updated_at.desc())
        )
        tickets = [
            AnalystTicket(number=r.number, title=r.title or "", state=r.state or "")
            for r in rows
        ]

    result = AnalystTicketsResponse(owner=owner, tickets=tickets, total=len(tickets))
    noc_cache.set(cache_key, result, ttl=20)
    return result


@router.get("/analyst-load-tickets", summary="Tickets atendidos por um analista no período (Carga Mensal)")
async def analyst_load_tickets(
    owner:      str        = Query(..., description="E-mail do analista (owner)"),
    month:      str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    start_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date:   str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    if month:
        from calendar import monthrange
        y, m = map(int, month.split("-"))
        start_date = f"{month}-01"
        end_date   = f"{month}-{monthrange(y, m)[1]:02d}"

    cache_key = f"analyst_load_tickets:{owner.strip().lower()}:{start_date}:{end_date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached

    conds = [func.lower(func.trim(Ticket.owner)) == owner.strip().lower(), _not_excluded_group()]
    if start_date:
        d = datetime.fromisoformat(start_date)
        conds.append(Ticket.created_at >= datetime(d.year, d.month, d.day, 0, 0, 0))
    if end_date:
        d = datetime.fromisoformat(end_date)
        conds.append(Ticket.created_at <= datetime(d.year, d.month, d.day, 23, 59, 59, 999999))

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket.number, Ticket.title, Ticket.state)
            .where(*conds).order_by(Ticket.created_at.desc()).limit(500)
        )
        tickets = [{"number": r.number, "title": r.title or "", "state": r.state or ""} for r in rows]

    result = {"owner": owner, "tickets": tickets, "total": len(tickets)}
    noc_cache.set(cache_key, result, ttl=300)
    return result


_FILA_STATES = _EM_ATEND_STATES | _ESCAL_STATES
_BUCKET_STATES = {
    "ag_cliente":   _STATE_AG_CLIENTE,
    "ag_terceiros": _STATE_AG_TERCEIROS,
    "resolvidos":   frozenset({"resolvido"}),
}
_VALID_BUCKETS = set(_BUCKET_STATES) | {"abertos", "em_atend"}


@router.get("/state-tickets", summary="Tickets atualmente num estado (drill-down da Operação)")
async def state_tickets(bucket: str = Query(..., description="em_atend|ag_cliente|ag_terceiros|abertos|resolvidos")):
    if bucket not in _VALID_BUCKETS:
        from fastapi import HTTPException
        raise HTTPException(422, f"bucket inválido: {bucket}")

    cache_key = f"state_tickets:{bucket}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached

    # Abertos e Em Atendimento seguem exatamente a definição do termômetro (queue):
    #   abertos   = estado "Aberto" OU (em atendimento/escalonado SEM dono real)
    #   em_atend  = em atendimento/escalonado COM dono real
    if bucket == "abertos":
        state_cond = or_(
            func.lower(Ticket.state) == "aberto",
            and_(func.lower(Ticket.state).in_(list(_FILA_STATES)), _owner_is_phantom()),
        )
    elif bucket == "em_atend":
        state_cond = and_(func.lower(Ticket.state).in_(list(_FILA_STATES)), _owner_is_real())
    else:
        state_cond = func.lower(Ticket.state).in_(list(_BUCKET_STATES[bucket]))

    conds = [state_cond, _not_excluded_group()]
    if bucket == "resolvidos":
        today = datetime.now(timezone.utc).date()
        conds.append(Ticket.updated_at >= datetime(today.year, today.month, today.day, 0, 0, 0))

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket.number, Ticket.title, Ticket.state, Ticket.owner)
            .where(*conds).order_by(Ticket.updated_at.desc()).limit(300)
        )
        tickets = [
            {"number": r.number, "title": r.title or "", "state": r.state or "", "owner": r.owner}
            for r in rows
        ]

    result = {"bucket": bucket, "tickets": tickets, "total": len(tickets)}
    noc_cache.set(cache_key, result, ttl=15)
    return result


@router.get("/day-tickets", summary="Tickets criados numa data — drill-down do Histórico")
async def day_tickets(date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")):
    from collections import Counter

    cache_key = f"day_tickets:{date}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached

    d = datetime.fromisoformat(date).date()
    day_start = datetime(d.year, d.month, d.day, 0, 0, 0)
    day_end   = datetime(d.year, d.month, d.day, 23, 59, 59, 999999)

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket.number, Ticket.title, Ticket.state, Ticket.group, Ticket.owner, Ticket.customer)
            .where(Ticket.created_at >= day_start, Ticket.created_at <= day_end, _not_excluded_group())
            .order_by(Ticket.created_at.desc())
        )
        tickets = [
            {"number": r.number, "title": r.title or "", "state": r.state or "",
             "group": (r.group or "—"), "owner": r.owner, "customer": r.customer}
            for r in rows
        ]

    gcount = Counter(t["group"] for t in tickets)
    groups = [{"group": g, "count": c} for g, c in gcount.most_common()]
    result = {"date": date, "total": len(tickets), "groups": groups, "tickets": tickets}
    noc_cache.set(cache_key, result, ttl=300)
    return result


@router.get("/export", summary="Exporta relatório Excel (.xlsx)")
async def export_excel(
    start_date: str | None = Query(None),
    end_date:   str | None = Query(None),
):
    xlsx_bytes = generate_excel_report(start_date=start_date, end_date=end_date)
    filename   = f"noc_report_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
