import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.config import get_settings
# Todos os grupos monitorados — sem filtros de grupo ou de owner_id
from app.core.database import AsyncSessionLocal
from app.models.ticket import SyncMeta, Ticket
from app.schemas.ticket import (
    ActivityEvent,
    ActivityFeed,
    AnalystLoadTodayResponse,
    AnalystTodayItem,
    HistoryPoint,
    HistoryResponse,
    QueueSummary,
    SLAAlert,
    SLAAlertList,
    SyncStatus,
    TeamMemberNow,
    TeamNowResponse,
    TodayFeed,
    TodayTicket,
    UrgentList,
    UrgentTicket,
    VIPRadarResponse,
    VIPTicket,
    ZombieList,
    ZombieTicket,
)
from app.services.cache import noc_cache
from app.services.sync import run_sync

logger   = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/noc", tags=["noc"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


# ── Mapeamento de estados (exatamente como gravados no Zammad) ─────────────────
#
# Card 1 — "Aberto": estado nativo do Zammad para tickets novos sem analista.
#   Fallback: "Em atendimento" / "Escalonado DEV" sem dono real.
# Card 2 — "Em atendimento": analista alocado (com dono real).
# Card 3 — "Aguardando Cliente"
# Card 4 — "Aguardando Terceiros"
# Card 5 — "Resolvido"    (hoje)
# Card 6 — "closed"       (hoje)
#
# Todas as comparações usam func.lower() — os sets ficam em minúsculo.

_STATE_ABERTO      = frozenset({"aberto"})
_STATE_FILA        = frozenset({"em atendimento", "escalonado dev", "escalonado rotas", "escalonado infra"})
_STATE_AG_CLIENTE  = frozenset({"aguardando cliente"})
_STATE_AG_TERCEIROS= frozenset({"aguardando terceiros"})
_STATE_RESOLVIDO   = frozenset({"resolvido"})
_STATE_FECHADO     = frozenset({"closed", "fechado", "merged"})

_CLOSED_STATES     = frozenset({"closed", "fechado", "merged"})

# ── Grupos e analistas excluídos do NOC operacional ───────────────────────────
# Inclui Informativo (automático) e grupos de Portabilidade/Ativações (não-operacional)
_GROUP_BLOCKLIST = frozenset({
    "informativo",
    "portabilidade",
    "ativações de tn's",
    "portal ativação - número",
    "saintes",
    "portabilidade > portabilidade interna",
})

# Analistas que atuam exclusivamente em grupos não-operacionais
_OWNER_BLOCKLIST = frozenset({
    "gabriel.alves@flux.net.br",
    "hanna.avila@flux.net.br",
    "jessica.cerveira@flux.net.br",
    "ryan.santos@flux.net.br",       # exibido como "Ryan Chaves" no Zammad
    "carlos@flux.net.br",            # inativo
    "carlos.roberto@flux.net.br",    # inativo
    "infrarotas@flux.net.br",        # inativo
    "thiagoventer@gmail.com",        # duplicado — usar thiago.venter.ext@flux.net.br
})


def _not_excluded_group():
    """Exclui grupos não-operacionais (portabilidade, informativo, etc.)."""
    return func.lower(func.trim(Ticket.group)).not_in(list(_GROUP_BLOCKLIST))


def _not_excluded_analyst():
    """Exclui analistas não-operacionais das visões por analista."""
    return func.lower(func.trim(Ticket.owner)).not_in(list(_OWNER_BLOCKLIST))


# ── Condições de dono ──────────────────────────────────────────────────────────

def _owner_is_phantom():
    """Owner ausente: NULL, vazio, '-', literais 'none'/'null', ou ID-sistema (1)."""
    return or_(
        Ticket.owner_id == 1,
        Ticket.owner.is_(None),
        func.lower(func.trim(Ticket.owner)).in_(["", "-", "none", "null"]),
    )


def _owner_is_real():
    """Owner é analista humano legítimo — nega todas as condições de phantom."""
    return and_(
        Ticket.owner_id != 1,
        Ticket.owner.isnot(None),
        func.lower(func.trim(Ticket.owner)).notin_(["", "-", "none", "null"]),
    )


def _last_business_day(today) -> "date":
    """Retorna o último dia útil anterior (pula sábado e domingo)."""
    d = today - timedelta(days=1)
    while d.weekday() >= 5:  # 5=Sábado, 6=Domingo
        d -= timedelta(days=1)
    return d


def _trend_pct(current: int, snapshot: dict | None, key: str) -> float | None:
    if snapshot is None:
        return None
    previous = snapshot.get(key, 0)
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


# ── /noc/queue ─────────────────────────────────────────────────────────────────

@router.get("/queue", response_model=QueueSummary, summary="Termômetro de fila — 6 KPIs do NOC")
async def get_queue(
    date: str | None = Query(None, description="YYYY-MM-DD — omitir para dados ao vivo de hoje"),
) -> QueueSummary:
    """
    6 contadores operacionais. Sem `date`: dados ao vivo. Com `date`: retorna
    o snapshot salvo para aquela data (útil para comparação histórica).

    1. chamados_abertos     — estado "Aberto" (nativo) OU "Em atendimento" sem dono.
    2. em_atendimento       — "Em atendimento"/"Escalonado DEV" COM dono real.
    3. aguardando_cliente   — "Aguardando Cliente".
    4. aguardando_terceiros — "Aguardando Terceiros".
    5. resolvidos_hoje      — "Resolvido" com updated_at = data.
    6. fechados_hoje        — "closed"/"fechado"/"merged" com updated_at = data.

    Snapshot diário salvo em SyncMeta para exibição de trending (% vs ontem).
    Cache TTL: 5 s.
    """
    today_iso = datetime.now(timezone.utc).date().isoformat()

    # ── Modo histórico: devolve snapshot salvo ──────────────────────────────────
    if date and date != today_iso:
        cache_key = f"queue_snap_{date}"
        cached = noc_cache.get(cache_key)
        if cached is not None:
            return cached
        snap_key = f"snap_{date}"
        async with AsyncSessionLocal() as session:
            row = await session.get(SyncMeta, snap_key)
        if row is None:
            raise HTTPException(
                status_code=404,
                detail=f"Nenhum snapshot encontrado para {date}. O dashboard precisa ter estado ativo nesse dia.",
            )
        snap = json.loads(row.value)
        result = QueueSummary(
            chamados_abertos=     snap.get("chamados_abertos",     0),
            em_atendimento=       snap.get("em_atendimento",       0),
            aguardando_cliente=   snap.get("aguardando_cliente",   0),
            aguardando_terceiros= snap.get("aguardando_terceiros", 0),
            resolvidos_hoje=      snap.get("resolvidos_hoje",      0),
            fechados_hoje=        snap.get("fechados_hoje",        0),
            synced_at=None,
        )
        noc_cache.set(cache_key, result, ttl=120)
        return result

    # ── Modo ao vivo ────────────────────────────────────────────────────────────
    cached = noc_cache.get("queue_summary")
    if cached is not None:
        return cached

    today         = datetime.now(timezone.utc).date()
    today_key     = f"snap_{today.isoformat()}"
    last_biz_key  = f"snap_{_last_business_day(today).isoformat()}"
    today_start   = datetime(today.year, today.month, today.day, 0, 0, 0)

    async with AsyncSessionLocal() as session:
        # Card 1 — "Aberto" (nativo) OU "Em atendimento" sem dono → fila de triagem
        abertos_count = (await session.scalar(
            select(func.count(Ticket.id)).where(
                or_(
                    func.lower(Ticket.state).in_(list(_STATE_ABERTO)),
                    and_(
                        func.lower(Ticket.state).in_(list(_STATE_FILA)),
                        _owner_is_phantom(),
                    ),
                ),
                _not_excluded_group(),
            )
        )) or 0

        # Card 2 — "Em atendimento" COM dono real
        atendimento_count = (await session.scalar(
            select(func.count(Ticket.id)).where(
                func.lower(Ticket.state).in_(list(_STATE_FILA)),
                _owner_is_real(),
                _not_excluded_group(),
            )
        )) or 0

        # Card 3 — Aguardando Cliente
        ag_cliente_count = (await session.scalar(
            select(func.count(Ticket.id)).where(
                func.lower(Ticket.state).in_(list(_STATE_AG_CLIENTE)),
                _not_excluded_group(),
            )
        )) or 0

        # Card 4 — Aguardando Terceiros
        ag_terceiros_count = (await session.scalar(
            select(func.count(Ticket.id)).where(
                func.lower(Ticket.state).in_(list(_STATE_AG_TERCEIROS)),
                _not_excluded_group(),
            )
        )) or 0

        # Card 5 — Resolvidos hoje
        resolvidos_count = (await session.scalar(
            select(func.count(Ticket.id)).where(
                func.lower(Ticket.state).in_(list(_STATE_RESOLVIDO)),
                Ticket.updated_at >= today_start,
                _not_excluded_group(),
            )
        )) or 0

        # Card 6 — Fechados hoje
        fechados_count = (await session.scalar(
            select(func.count(Ticket.id)).where(
                func.lower(Ticket.state).in_(list(_STATE_FECHADO)),
                Ticket.updated_at >= today_start,
                _not_excluded_group(),
            )
        )) or 0

        # Snapshot diário (upsert)
        current_snap = {
            "chamados_abertos":     abertos_count,
            "em_atendimento":       atendimento_count,
            "aguardando_cliente":   ag_cliente_count,
            "aguardando_terceiros": ag_terceiros_count,
            "resolvidos_hoje":      resolvidos_count,
            "fechados_hoje":        fechados_count,
        }
        await session.execute(
            sqlite_insert(SyncMeta)
            .values(key=today_key, value=json.dumps(current_snap))
            .on_conflict_do_update(
                index_elements=["key"],
                set_={"value": json.dumps(current_snap)},
            )
        )
        last_biz_row   = await session.get(SyncMeta, last_biz_key)
        last_biz_snap  = json.loads(last_biz_row.value) if last_biz_row else None
        meta_row       = await session.get(SyncMeta, "last_sync_at")
        synced_at      = datetime.fromisoformat(meta_row.value) if meta_row else None
        await session.commit()

    summary = QueueSummary(
        chamados_abertos=     abertos_count,
        em_atendimento=       atendimento_count,
        aguardando_cliente=   ag_cliente_count,
        aguardando_terceiros= ag_terceiros_count,
        resolvidos_hoje=      resolvidos_count,
        fechados_hoje=        fechados_count,
        synced_at=synced_at,
        trend_chamados_abertos=     _trend_pct(abertos_count,      last_biz_snap, "chamados_abertos"),
        trend_em_atendimento=       _trend_pct(atendimento_count,  last_biz_snap, "em_atendimento"),
        trend_aguardando_cliente=   _trend_pct(ag_cliente_count,   last_biz_snap, "aguardando_cliente"),
        trend_aguardando_terceiros= _trend_pct(ag_terceiros_count, last_biz_snap, "aguardando_terceiros"),
        trend_resolvidos_hoje=      _trend_pct(resolvidos_count,   last_biz_snap, "resolvidos_hoje"),
        trend_fechados_hoje=        _trend_pct(fechados_count,     last_biz_snap, "fechados_hoje"),
    )
    noc_cache.set("queue_summary", summary, ttl=5)
    return summary


# ── /noc/sla-alerts ────────────────────────────────────────────────────────────

@router.get("/sla-alerts", response_model=SLAAlertList, summary="Chamados próximos do vencimento de SLA")
async def get_sla_alerts() -> SLAAlertList:
    cached = noc_cache.get("sla_alerts")
    if cached is not None:
        return cached

    alert_window = timedelta(minutes=settings.sla_alert_minutes)
    now      = datetime.now(timezone.utc)
    deadline = now + alert_window
    alerts: list[SLAAlert] = []

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket).where(
                Ticket.sla_response_at.isnot(None),
                Ticket.sla_response_at <= deadline,
                Ticket.sla_response_at >= now,
                Ticket.state.notin_(["closed", "fechado", "merged"]),
            )
        )
        for (ticket,) in rows:
            minutes_left = (ticket.sla_response_at - now).total_seconds() / 60
            alerts.append(SLAAlert(
                ticket_id=ticket.id, number=ticket.number, title=ticket.title,
                priority=ticket.priority, customer=ticket.customer, group=ticket.group,
                sla_deadline=ticket.sla_response_at,
                minutes_remaining=round(minutes_left, 1), breach_type="response",
            ))

        seen_ids = list({a.ticket_id for a in alerts})
        solution_filters = [
            Ticket.sla_solution_at.isnot(None),
            Ticket.sla_solution_at <= deadline,
            Ticket.sla_solution_at >= now,
            Ticket.state.notin_(["closed", "fechado", "merged"]),
        ]
        if seen_ids:
            solution_filters.append(Ticket.id.notin_(seen_ids))

        rows = await session.execute(select(Ticket).where(*solution_filters))
        for (ticket,) in rows:
            minutes_left = (ticket.sla_solution_at - now).total_seconds() / 60
            alerts.append(SLAAlert(
                ticket_id=ticket.id, number=ticket.number, title=ticket.title,
                priority=ticket.priority, customer=ticket.customer, group=ticket.group,
                sla_deadline=ticket.sla_solution_at,
                minutes_remaining=round(minutes_left, 1), breach_type="solution",
            ))

    alerts.sort(key=lambda a: a.minutes_remaining)
    result = SLAAlertList(alerts=alerts, count=len(alerts))
    noc_cache.set("sla_alerts", result, ttl=5)
    return result


# ── /noc/urgents ───────────────────────────────────────────────────────────────

@router.get("/urgents", response_model=UrgentList, summary="Chamados com prioridade URGENTE ativos")
async def get_urgent_tickets() -> UrgentList:
    cached = noc_cache.get("urgents")
    if cached is not None:
        return cached

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket)
            .where(
                Ticket.priority.ilike("%urgente%"),
                func.lower(Ticket.state).notin_(["resolvido", "fechado", "closed", "merged"]),
                or_(
                    Ticket.owner.is_(None),
                    func.lower(func.trim(Ticket.owner)).notlike("auto-%"),
                ),
            )
            .order_by(Ticket.created_at.asc())
        )
        tickets = [row[0] for row in rows]

    result = UrgentList(
        tickets=[
            UrgentTicket(
                ticket_id=t.id, number=t.number, title=t.title,
                customer=t.customer, group=t.group, owner=t.owner,
                created_at=t.created_at,
            )
            for t in tickets
        ],
        count=len(tickets),
    )
    noc_cache.set("urgents", result, ttl=5)
    return result


# ── /noc/idle ──────────────────────────────────────────────────────────────────

@router.get("/idle", response_model=ZombieList, summary="Chamados parados — sem atualização há N dias")
async def get_idle_tickets(
    idle_days: int = Query(3, ge=1, le=30),
) -> ZombieList:
    cache_key = f"idle:{idle_days}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached

    threshold = datetime.now(timezone.utc) - timedelta(days=idle_days)
    now       = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket)
            .where(
                Ticket.state.ilike("%open%") | Ticket.state.ilike("%aberto%"),
                Ticket.updated_at < threshold,
            )
            .order_by(Ticket.updated_at.asc())
            .limit(20)
        )
        tickets = [row[0] for row in rows]

    zombies = [
        ZombieTicket(
            ticket_id=t.id, number=t.number, title=t.title,
            owner=t.owner, group=t.group,
            days_idle=round((now - _utc(t.updated_at)).total_seconds() / 86400, 1),
            updated_at=t.updated_at,
        )
        for t in tickets
    ]
    result = ZombieList(zombies=zombies, count=len(zombies), idle_days_threshold=idle_days)
    noc_cache.set(cache_key, result, ttl=30)
    return result


# ── /noc/history ───────────────────────────────────────────────────────────────

@router.get("/history", response_model=HistoryResponse, summary="Evolução histórica da fila")
async def get_history() -> HistoryResponse:
    cached = noc_cache.get("queue_history")
    if cached is not None:
        return cached

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(SyncMeta).where(SyncMeta.key.like("snap_%")).order_by(SyncMeta.key.asc())
        )
        points: list[HistoryPoint] = []
        for (meta,) in rows:
            date_str = meta.key[5:]
            snap = json.loads(meta.value)
            points.append(HistoryPoint(
                date=date_str,
                chamados_abertos=     snap.get("chamados_abertos",     0),
                em_atendimento=       snap.get("em_atendimento",       0),
                aguardando_cliente=   snap.get("aguardando_cliente",   0),
                aguardando_terceiros= snap.get("aguardando_terceiros", 0),
                resolvidos_hoje=      snap.get("resolvidos_hoje",      0),
                fechados_hoje=        snap.get("fechados_hoje",        0),
            ))

    result = HistoryResponse(points=points, days=len(points))
    noc_cache.set("queue_history", result, ttl=60)
    return result


# ── /noc/activity ──────────────────────────────────────────────────────────────

@router.get("/activity", response_model=ActivityFeed, summary="Feed de atividade recente")
async def get_activity(
    limit: int = Query(10, ge=5, le=20),
) -> ActivityFeed:
    cache_key = f"activity:{limit}"
    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket)
            .where(_not_excluded_group())
            .order_by(Ticket.updated_at.desc())
            .limit(limit * 2)
        )
        tickets = [row[0] for row in rows]

    events: list[ActivityEvent] = []
    seen_ids: set[int] = set()

    for t in tickets:
        if len(events) >= limit:
            break
        if t.id in seen_ids:
            continue
        seen_ids.add(t.id)

        is_closed   = t.state.lower() in _CLOSED_STATES
        created_at  = _utc(t.created_at)
        age_seconds = (now - created_at).total_seconds() if created_at else 999_999

        if is_closed and t.close_at:
            event_type  = "closed"
            happened_at = _utc(t.close_at)
        elif age_seconds < 86_400:
            event_type  = "created"
            happened_at = created_at
        else:
            event_type  = "updated"
            happened_at = _utc(t.updated_at) or created_at or now

        events.append(ActivityEvent(
            ticket_id=t.id, number=t.number, title=t.title,
            event_type=event_type, actor=t.owner, state=t.state,
            happened_at=happened_at,
        ))

    result = ActivityFeed(events=events, count=len(events))
    noc_cache.set(cache_key, result, ttl=5)
    return result


# ── /noc/vip ───────────────────────────────────────────────────────────────────
# Adicione os nomes exatos dos clientes VIP (case-insensitive).
# Use: SELECT DISTINCT customer FROM tickets ORDER BY customer; para descobrir os nomes.

_VIP_CUSTOMERS: frozenset[str] = frozenset({
    "diretoria flux",
    "link principal",
    "presidência",
    "board",
    "diretoria",
    "cliente vip",
})


@router.get("/vip", response_model=VIPRadarResponse, summary="Radar VIP — contas estratégicas")
async def get_vip_tickets() -> VIPRadarResponse:
    cached = noc_cache.get("vip_tickets")
    if cached is not None:
        return cached

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket)
            .where(Ticket.state.notin_(["closed", "fechado", "merged"]))
            .order_by(Ticket.created_at.asc())
        )
        all_active = [row[0] for row in rows]

    vip_tickets = [
        t for t in all_active
        if t.customer and t.customer.lower() in _VIP_CUSTOMERS
    ]

    result = VIPRadarResponse(
        tickets=[
            VIPTicket(
                ticket_id=t.id, number=t.number, title=t.title,
                customer=t.customer, state=t.state, priority=t.priority,
                owner=t.owner, created_at=t.created_at,
            )
            for t in vip_tickets
        ],
        count=len(vip_tickets),
        vip_customers=sorted(_VIP_CUSTOMERS),
    )
    noc_cache.set("vip_tickets", result, ttl=5)
    return result


# ── /noc/today-feed ────────────────────────────────────────────────────────────

@router.get(
    "/today-feed",
    response_model=TodayFeed,
    summary="Feed de chamados abertos hoje — mais recente primeiro",
)
async def get_today_feed() -> TodayFeed:
    """
    Todos os chamados de grupos NOC criados hoje (00:00 UTC → agora),
    ordenados estritamente do mais recente para o mais antigo.

    Campos: número, título, estado atual (nome exato do Zammad),
    proprietário e horário de criação.
    Cache TTL: 10 s.
    """
    cached = noc_cache.get("today_feed")
    if cached is not None:
        return cached

    today       = datetime.now(timezone.utc).date()
    today_start = datetime(today.year, today.month, today.day, 0, 0, 0)

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket)
            .where(Ticket.created_at >= today_start, _not_excluded_group())
            .order_by(Ticket.created_at.desc())
        )
        tickets = [row[0] for row in rows]

    def _clean_owner(owner: str | None) -> str | None:
        if not owner:
            return None
        stripped = owner.strip()
        return None if stripped in ("", "-", "none", "null") else stripped

    result = TodayFeed(
        tickets=[
            TodayTicket(
                ticket_id  = t.id,
                number     = t.number,
                title      = t.title,
                state      = t.state,
                owner      = _clean_owner(t.owner),
                group      = t.group,
                created_at = t.created_at,
            )
            for t in tickets
        ],
        count=len(tickets),
        date=today.isoformat(),
    )
    noc_cache.set("today_feed", result, ttl=10)
    return result


# ── /noc/today-analyst-load ────────────────────────────────────────────────────

@router.get(
    "/today-analyst-load",
    response_model=AnalystLoadTodayResponse,
    summary="Carga por analista — tickets criados na data informada",
)
async def get_today_analyst_load(
    date: str | None = Query(None, description="YYYY-MM-DD — omitir para hoje"),
) -> AnalystLoadTodayResponse:
    """
    Conta, por analista, quantos chamados foram criados na data informada.
    - Hoje: exclui resolvidos/fechados (carga ativa atual).
    - Histórico: inclui todos os estados (carga total trabalhada no dia).
    Exclui sistema (owner_id=1), phantoms e IDs externos.
    Cache TTL: 10 s (hoje) / 5 min (histórico).
    """
    today_iso   = datetime.now(timezone.utc).date().isoformat()
    target_iso  = date if date else today_iso
    is_today    = target_iso == today_iso
    cache_key   = f"analyst_load_{target_iso}"

    cached = noc_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        target_date = datetime.fromisoformat(target_iso).date()
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Data inválida: {target_iso}. Use YYYY-MM-DD.")

    day_start = datetime(target_date.year, target_date.month, target_date.day, 0, 0, 0)
    day_end   = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, 999999)

    async with AsyncSessionLocal() as session:
        conditions = [
            Ticket.created_at >= day_start,
            Ticket.created_at <= day_end,
            _owner_is_real(),
            func.lower(func.trim(Ticket.owner)).notlike("auto-%"),
            _not_excluded_group(),
            _not_excluded_analyst(),
        ]
        # Para hoje: mostra apenas ativos (excl. resolvidos/fechados)
        # Para histórico: todos os estados — mostra carga total trabalhada no dia
        if is_today:
            conditions.append(
                func.lower(Ticket.state).notin_(list(_STATE_FECHADO | _STATE_RESOLVIDO))
            )

        rows = await session.execute(
            select(Ticket.owner, func.count(Ticket.id).label("cnt"))
            .where(*conditions)
            .group_by(Ticket.owner)
            .order_by(func.count(Ticket.id).desc())
        )
        items = [
            AnalystTodayItem(owner=row.owner, ticket_count=row.cnt)
            for row in rows
        ]

    total  = sum(i.ticket_count for i in items)
    result = AnalystLoadTodayResponse(items=items, date=target_iso, total=total)
    noc_cache.set(cache_key, result, ttl=10 if is_today else 300)
    return result


# ── /noc/debug/queue-snap ─────────────────────────────────────────────────────

@router.get("/debug/queue-snap", summary="[DEBUG] Lê snapshot de uma data do banco")
async def debug_queue_snap(date: str = Query(..., description="YYYY-MM-DD")):
    today_iso = datetime.now(timezone.utc).date().isoformat()
    snap_key  = f"snap_{date}"
    async with AsyncSessionLocal() as session:
        row = await session.get(SyncMeta, snap_key)
    if row is None:
        return {"error": f"Snapshot {snap_key} não encontrado", "today_iso": today_iso}
    return {
        "today_iso": today_iso,
        "requested_date": date,
        "is_historical": date != today_iso,
        "snap_key": snap_key,
        "snap": json.loads(row.value),
    }


# ── /noc/team-now ─────────────────────────────────────────────────────────────

@router.get(
    "/team-now",
    response_model=TeamNowResponse,
    summary="Equipe ativa no momento — analistas com tickets Em Atendimento agora",
)
async def get_team_now() -> TeamNowResponse:
    """
    Retorna analistas que têm pelo menos um ticket atualmente no estado
    "Em atendimento" ou "Escalonado DEV" em grupos NOC.
    Diferente de today-analyst-load, não filtra por data de criação —
    mostra quem está ocupado AGORA independente de quando o ticket foi aberto.
    Cache TTL: 20 s.
    """
    cached = noc_cache.get("team_now")
    if cached is not None:
        return cached

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Ticket.owner, func.count(Ticket.id).label("cnt"))
            .where(
                func.lower(Ticket.state).in_(list(_STATE_FILA)),
                _owner_is_real(),
                func.lower(func.trim(Ticket.owner)).notlike("auto-%"),
                _not_excluded_group(),
                _not_excluded_analyst(),
            )
            .group_by(Ticket.owner)
            .order_by(func.count(Ticket.id).desc())
        )
        members = [
            TeamMemberNow(owner=row.owner, active_count=row.cnt)
            for row in rows
        ]

    result = TeamNowResponse(
        members=members,
        total_tickets=sum(m.active_count for m in members),
    )
    noc_cache.set("team_now", result, ttl=20)
    return result


# ── /noc/sync/trigger ──────────────────────────────────────────────────────────

@router.post("/sync/trigger", summary="Dispara sincronização manual com o Zammad")
async def trigger_sync(
    full_sync: bool = Query(False, description="Se True, refaz o sync completo desde _SYNC_SINCE"),
) -> dict:
    try:
        result = await run_sync(full_sync=full_sync)
        noc_cache.clear()
        return result
    except Exception as exc:
        logger.error("Sync manual falhou: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── /noc/debug/abertos ────────────────────────────────────────────────────────

@router.get("/debug/abertos", summary="[DEBUG] Lista tickets contados no Card 1 — Abertos")
async def debug_abertos():
    """
    Retorna todos os tickets que compõem o Card 1 (Abertos / fila de triagem):
      - Estado = 'Aberto'  OU
      - Estado = 'Em atendimento' / 'Escalonado DEV' sem dono real
      - Excluindo grupos de notificação automática (_CARD1_EXCLUDED_GROUPS)
    Útil para validar se o contador está correto.
    """
    async with AsyncSessionLocal() as session:
        stmt = (
            select(
                Ticket.id, Ticket.number, Ticket.title,
                Ticket.state, Ticket.owner, Ticket.owner_id,
                Ticket.group, Ticket.updated_at,
            )
            .where(
                or_(
                    func.lower(Ticket.state).in_(list(_STATE_ABERTO)),
                    and_(
                        func.lower(Ticket.state).in_(list(_STATE_FILA)),
                        _owner_is_phantom(),
                    ),
                ),
            )
            .order_by(Ticket.updated_at.desc())
        )
        rows = (await session.execute(stmt)).all()

    return {
        "total": len(rows),
        "tickets": [
            {
                "id":       r.id,
                "number":   r.number,
                "title":    r.title,
                "state":    r.state,
                "owner":    r.owner,
                "owner_id": r.owner_id,
                "group":    r.group,
                "updated_at": r.updated_at,
                "motivo": (
                    "estado=Aberto"
                    if (r.state or "").lower() in _STATE_ABERTO
                    else "em_atendimento_sem_dono"
                ),
            }
            for r in rows
        ],
    }


# ── /noc/debug/ticket/{number} ─────────────────────────────────────────────────

@router.get("/debug/ticket/{number}", summary="[DEBUG] Raio-X de ticket pelo número")
async def debug_ticket(number: str):
    async with AsyncSessionLocal() as session:
        row    = await session.execute(select(Ticket).where(Ticket.number == number))
        ticket = row.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail=f"Ticket #{number} não encontrado.")
    return {
        "number":           ticket.number,
        "state":            ticket.state,
        "state_lower":      ticket.state.lower() if ticket.state else None,
        "group":            ticket.group,
        "group_normalized": ticket.group.lower().strip() if ticket.group else None,
        "group": ticket.group,
        "owner":            ticket.owner,
        "owner_id":         ticket.owner_id,
        "updated_at":       ticket.updated_at,
        "created_at":       ticket.created_at,
    }
