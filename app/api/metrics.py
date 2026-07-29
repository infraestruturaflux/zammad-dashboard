import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.schemas.metrics import (
    AnalystDayDetailResponse,
    AnalystLoadResponse,
    AnalystPerformanceResponse,
    FRTStats,
    FRTToday,
    HeatmapResponse,
    MTTAStatsResponse,
    MTTRStatsResponse,
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
