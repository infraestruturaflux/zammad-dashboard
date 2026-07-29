import asyncio
import calendar
import logging
import time
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.ticket import SyncMeta, Ticket
from app.models.ticket_event import TicketEvent
from app.models.zammad_user import ZammadUser
from app.services.cache import noc_cache
from app.services.zammad_client import ZammadClient

logger = logging.getLogger(__name__)

# Corte para o full sync inicial — ajuste para a data desejada
_SYNC_SINCE = "2026-01-01"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _monthly_queries(since: str) -> list[str]:
    """
    Fatia o intervalo desde 'since' até hoje em queries mensais.
    Evita o limite de resultados do Zammad/Elasticsearch (~500–10 000 por query).
    Ex.: ['created_at:>=2026-01-01 created_at:<=2026-01-31', ...]
    """
    queries: list[str] = []
    start = date.fromisoformat(since)
    today = date.today()
    y, m = start.year, start.month
    while (y, m) <= (today.year, today.month):
        last_day  = calendar.monthrange(y, m)[1]
        month_end = min(date(y, m, last_day), today)
        queries.append(
            f"created_at:>={y:04d}-{m:02d}-01 created_at:<={month_end.isoformat()}"
        )
        m += 1
        if m > 12:
            m = 1
            y += 1
    return queries


def _incremental_since_date() -> str:
    """
    Data de ontem como string pura (YYYY-MM-DD).

    Usar data pura (sem hora/timezone) elimina descasamento silencioso entre
    fuso do servidor Python e fuso do Elasticsearch do Zammad.
    O UPSERT idempotente torna o repuxo de tickets já existentes inofensivo.
    """
    return (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _history_to_event_rows(ticket_id: int, history: list[dict]) -> list[dict]:
    """
    Converte os eventos brutos do Zammad em linhas para a tabela ticket_events.
    Campos relevantes mapeados: state, owner, owner_id + evento de criação.
    """
    rows = []
    for evt in history:
        # IDs
        evt_id = evt.get("id")
        if not evt_id:
            continue

        etype = (evt.get("type") or evt.get("history_type") or "").lower()
        field = (evt.get("attribute") or evt.get("history_attribute") or "").lower()

        # Ignora eventos sem campo relevante (exceto 'created')
        if etype != "created" and field not in ("state", "owner", "owner_id"):
            continue

        # Normaliza field: owner_id → owner (para consistência)
        field_norm = "owner" if field == "owner_id" else field or etype

        rows.append({
            "id":         int(evt_id),
            "ticket_id":  ticket_id,
            "event_type": etype,
            "field":      field_norm,
            "value_from": str(evt.get("value_from") or ""),
            "value_to":   str(evt.get("value_to")   or ""),
            "created_at": _parse_dt(evt.get("created_at")),
            "created_by": str(evt.get("created_by") or ""),
        })
    return rows


def _calculate_frt(ticket_created_at: datetime, articles: list[dict]) -> int | None:
    for article in sorted(articles, key=lambda a: a.get("created_at", "")):
        if article.get("sender") == "Agent" and not article.get("internal", False):
            article_dt = _parse_dt(article.get("created_at"))
            if article_dt:
                return max(0, int((article_dt - ticket_created_at).total_seconds()))
    return None


def _extract_recipient(articles: list[dict]) -> str | None:
    """
    Destinatário do ticket = campo "To" do 1º email de ENTRADA (do cliente).
    Ex.: "Sofia via Portabilidade <portabilidade@flux.net.br>, lucas@flux.net.br".
    Usado para filtrar encaminhamentos a caixas de sistema no Top Ofensores.
    """
    ordered = sorted(articles, key=lambda a: a.get("created_at", ""))
    # Preferência: 1º artigo do Customer (email de entrada). Senão, 1º com "to".
    for art in ordered:
        if art.get("sender") == "Customer":
            to = (art.get("to") or "").strip()
            if to:
                return to[:512]
    for art in ordered:
        to = (art.get("to") or "").strip()
        if to:
            return to[:512]
    return None


def _ticket_to_row(raw: dict) -> dict:
    return {
        "id":              raw["id"],
        "number":          str(raw.get("number", "")),
        "title":           raw.get("title", ""),
        "state_id":        raw.get("state_id", 0),
        "state":           raw.get("state", ""),
        "priority_id":     raw.get("priority_id", 0),
        "priority":        raw.get("priority", ""),
        "group_id":        raw.get("group_id", 0),
        "group":           raw.get("group"),
        "owner_id":        raw.get("owner_id"),
        "owner":           raw.get("owner"),
        "customer_id":     raw.get("customer_id", 0),
        "customer":        raw.get("customer"),
        "created_at":      _parse_dt(raw.get("created_at")),
        "updated_at":      _parse_dt(raw.get("updated_at")),
        "close_at":        _parse_dt(raw.get("close_at")),
        "sla_response_at": _parse_dt(raw.get("sla_response_at")),
        "sla_solution_at": _parse_dt(raw.get("sla_solution_at")),
        "frt_seconds":     None,
        "recipient":       None,
    }


async def _get_meta(session: AsyncSession, key: str) -> str | None:
    row = await session.get(SyncMeta, key)
    return row.value if row else None


async def _set_meta(session: AsyncSession, key: str, value: str) -> None:
    stmt = sqlite_insert(SyncMeta).values(key=key, value=value)
    stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={"value": value})
    await session.execute(stmt)


# ── run_sync ───────────────────────────────────────────────────────────────────

async def sync_users() -> int:
    """
    Sincroniza os usuários (agentes) do Zammad → tabela zammad_users.
    Guarda o flag `active` para filtrar analistas inativos nas métricas.
    Retorna a quantidade de usuários gravados.
    """
    upserted = 0
    async with ZammadClient() as client:
        page = 1
        while True:
            try:
                batch = await client.get_users(page=page, per_page=100)
            except Exception as exc:
                logger.warning("[SYNC users] erro no fetch página %d: %s", page, exc)
                break
            if not batch:
                break

            async with AsyncSessionLocal() as session:
                for u in batch:
                    try:
                        uid = u.get("id")
                        if not uid:
                            continue
                        firstname = (u.get("firstname") or "").strip()
                        lastname  = (u.get("lastname")  or "").strip()
                        name = f"{firstname} {lastname}".strip()
                        row = {
                            "id":         int(uid),
                            "email":      (u.get("email") or "").strip().lower() or None,
                            "login":      (u.get("login") or "").strip().lower() or None,
                            "name":       name or None,
                            "active":     bool(u.get("active", True)),
                            "updated_at": _parse_dt(u.get("updated_at")),
                        }
                        ins = sqlite_insert(ZammadUser).values(**row)
                        stmt = ins.on_conflict_do_update(
                            index_elements=["id"],
                            set_={
                                "email": ins.excluded.email, "login": ins.excluded.login,
                                "name": ins.excluded.name, "active": ins.excluded.active,
                                "updated_at": ins.excluded.updated_at,
                            },
                        )
                        await session.execute(stmt)
                        upserted += 1
                    except Exception as exc:
                        logger.warning("[SYNC users] usuário %s ignorado: %s", u.get("id", "?"), exc)
                await session.commit()

            if len(batch) < 100:
                break
            page += 1
            await asyncio.sleep(0.3)

    logger.info("[SYNC users] %d usuários sincronizados.", upserted)
    return upserted


async def run_sync(*, full_sync: bool = False) -> dict:
    """
    Sincroniza tickets do Zammad → SQLite.

    full_sync=True  — varre tudo desde _SYNC_SINCE (recuperação de histórico).
    full_sync=False — arrastão diário: updated_at >= ontem (data pura, imune a tz).

    Garantias:
    • Cada página commitada independentemente (progresso preservado em crash).
    • Erro por ticket logado e ignorado — o restante da página continua.
    • Cache NOC invalidado após cada página gravada.
    • Nenhum filtro por estado/grupo na query — o banco recebe tudo;
      filtros de negócio ficam nas queries de leitura.
    """
    start    = time.monotonic()
    upserted = 0
    skipped  = 0
    errors: list[str] = []

    # Sincroniza usuários (agentes) — flag active p/ filtrar analistas inativos.
    # Falha aqui não interrompe o sync de tickets.
    try:
        await sync_users()
    except Exception as exc:
        logger.warning("[SYNC] sync_users falhou (seguindo com tickets): %s", exc)

    async with AsyncSessionLocal() as session:
        last_sync_str = await _get_meta(session, "last_sync_at")

    if full_sync or not last_sync_str:
        # Full sync fatiado por mês — evita o limite de resultados do Zammad
        search_queries = _monthly_queries(_SYNC_SINCE)
        mode_label     = "FULL SYNC mensal" + (" (forçado)" if full_sync else " (primeira execução)")
    else:
        since_date     = _incremental_since_date()
        search_queries = [f"updated_at:>={since_date}"]
        mode_label     = f"INCREMENTAL (updated_at >= {since_date})"

    logger.info("[SYNC] Modo: %s | %d query(s)", mode_label, len(search_queries))

    # ── Otimização do histórico ───────────────────────────────────────────────
    # 1) Pula tickets de grupos não-operacionais (nunca aparecem nas métricas)
    # 2) Pula tickets que já têm histórico capturado (evita re-fetch desnecessário)
    from app.services.metrics import _OFFENDER_GROUP_BLOCKLIST as _HIST_GROUP_BLOCKLIST
    from sqlalchemy import select as _select

    tickets_with_events: set[int] = set()
    async with AsyncSessionLocal() as session:
        rows = await session.execute(_select(TicketEvent.ticket_id).distinct())
        tickets_with_events = {r[0] for r in rows.all()}
    logger.info("[SYNC] Histórico: %d tickets já têm eventos (serão pulados); "
                "grupos bloqueados também pulados.", len(tickets_with_events))

    async with ZammadClient() as client:
        for q_idx, search_query in enumerate(search_queries, 1):
            logger.info("[SYNC] Query %d/%d: %r", q_idx, len(search_queries), search_query)
            page     = 1
            per_page = 100

            while True:
                logger.info("[SYNC] → página %d (query %d)", page, q_idx)
                try:
                    raw_response = await client.search_tickets(search_query, page=page, per_page=per_page)
                    if isinstance(raw_response, list):
                        batch = raw_response
                    elif isinstance(raw_response, dict):
                        batch = raw_response.get("tickets") or []
                        if isinstance(batch, dict):
                            batch = list(batch.values())
                    else:
                        batch = []
                    logger.info("[SYNC] ← %d tickets na página %d (query %d)", len(batch), page, q_idx)
                except Exception as exc:
                    msg = f"Query {q_idx} página {page}: erro no fetch — {exc}"
                    logger.error(msg)
                    errors.append(msg)
                    break

                if not batch:
                    break

                page_upserted = 0
                page_skipped  = 0

                async with AsyncSessionLocal() as session:
                    for raw in batch:
                        try:
                            row      = _ticket_to_row(raw)
                            existing = await session.get(Ticket, raw["id"])

                            # Busca artigos se faltar FRT OU destinatário
                            need_articles = (
                                existing is None
                                or existing.frt_seconds is None
                                or getattr(existing, "recipient", None) is None
                            )
                            if need_articles:
                                try:
                                    articles   = await client.get_ticket_articles(raw["id"])
                                    created_at = row["created_at"]
                                    if created_at and (existing is None or existing.frt_seconds is None):
                                        row["frt_seconds"] = _calculate_frt(created_at, articles)
                                    elif existing:
                                        row["frt_seconds"] = existing.frt_seconds
                                    row["recipient"] = _extract_recipient(articles)
                                except Exception as art_exc:
                                    logger.warning("Artigos ticket %s: %s", raw.get("id", "?"), art_exc)
                                    if existing:
                                        row["frt_seconds"] = existing.frt_seconds
                                        row["recipient"]   = existing.recipient
                            elif existing:
                                row["frt_seconds"] = existing.frt_seconds
                                row["recipient"]   = existing.recipient

                            # ── Sync de histórico de eventos (otimizado) ──────
                            tid        = raw["id"]
                            group_norm = (raw.get("group") or "").lower().strip()
                            skip_hist  = (
                                group_norm in _HIST_GROUP_BLOCKLIST   # grupo não-operacional
                                or tid in tickets_with_events          # já tem histórico
                            )
                            if not skip_hist:
                                try:
                                    history = await client.get_ticket_history(tid)
                                    event_rows = _history_to_event_rows(tid, history)
                                    for er in event_rows:
                                        ev_ins  = sqlite_insert(TicketEvent).values(**er)
                                        ev_stmt = ev_ins.on_conflict_do_nothing(
                                            index_elements=["id"]
                                        )
                                        await session.execute(ev_stmt)
                                    tickets_with_events.add(tid)  # marca como feito nesta sessão
                                except Exception as hist_exc:
                                    logger.warning("Histórico ticket %s: %s", tid, hist_exc)

                            ins  = sqlite_insert(Ticket).values(**row)
                            stmt = ins.on_conflict_do_update(
                                index_elements=["id"],
                                set_={
                                    "number":          ins.excluded.number,
                                    "title":           ins.excluded.title,
                                    "state_id":        ins.excluded.state_id,
                                    "state":           ins.excluded.state,
                                    "owner_id":        ins.excluded.owner_id,
                                    "owner":           ins.excluded.owner,
                                    "group_id":        ins.excluded.group_id,
                                    "group":           ins.excluded.group,
                                    "priority_id":     ins.excluded.priority_id,
                                    "priority":        ins.excluded.priority,
                                    "customer_id":     ins.excluded.customer_id,
                                    "customer":        ins.excluded.customer,
                                    "updated_at":      ins.excluded.updated_at,
                                    "close_at":        ins.excluded.close_at,
                                    "sla_response_at": ins.excluded.sla_response_at,
                                    "sla_solution_at": ins.excluded.sla_solution_at,
                                    "frt_seconds":     ins.excluded.frt_seconds,
                                    "recipient":       ins.excluded.recipient,
                                },
                            )
                            await session.execute(stmt)
                            page_upserted += 1

                        except Exception as exc:
                            page_skipped += 1
                            msg = f"Ticket {raw.get('id', '?')} ignorado: {exc}"
                            logger.error(msg)
                            errors.append(msg)
                            continue

                    await session.commit()

                if page_upserted > 0:
                    noc_cache.clear()

                upserted += page_upserted
                skipped  += page_skipped
                logger.info("Página %d (query %d): %d salvos | %d ignorados | total=%d",
                            page, q_idx, page_upserted, page_skipped, upserted)

                if len(batch) < per_page:
                    break

                page += 1
                await asyncio.sleep(0.5)

    now_iso = datetime.now(timezone.utc).isoformat()
    async with AsyncSessionLocal() as session:
        await _set_meta(session, "last_sync_at", now_iso)
        await session.commit()

    duration = time.monotonic() - start
    status   = "ok" if not errors else "partial"
    logger.info("Sync %s: %d salvos, %d ignorados, %.2fs.", status, upserted, skipped, duration)

    return {
        "status":           status,
        "tickets_upserted": upserted,
        "tickets_skipped":  skipped,
        "last_sync_at":     datetime.now(timezone.utc),
        "duration_seconds": round(duration, 3),
        "search_query":     search_query,
        "errors":           errors,
    }
