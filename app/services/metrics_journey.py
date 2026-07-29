"""
Métricas de jornada do ticket: MTTR, MTTA e rastreamento de posse (handoffs).

Funções principais:
  compute_ticket_journey(ticket_id)   → jornada completa de um ticket
  compute_mttr_stats(start, end)      → estatísticas agregadas de MTTR no período
  compute_mtta_stats(start, end)      → estatísticas agregadas de MTTA no período
"""

import logging
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import create_engine, text

from app.core.config import get_settings
from app.services.time_utils import biz_hours, fmt_h, wall_hours

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sync_engine():
    url = get_settings().database_url.replace("+aiosqlite", "")
    return create_engine(url, connect_args={"check_same_thread": False})


def _to_ts(val) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return pd.Timestamp(val).to_pydatetime()
    except Exception:
        return None


def _norm_name(s: str) -> str:
    """Normaliza nome para comparação: minúsculo, sem acento, espaços colapsados."""
    import unicodedata
    s = (s or "").strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


def _inactive_analyst_names() -> set[str]:
    """
    Conjunto de nomes (normalizados) de analistas que NÃO devem aparecer nas
    métricas de desempenho:
      • inativos no Zammad (active = 0 na tabela zammad_users)
      • presentes na blocklist de não-operacionais (_ANALYST_BLOCKLIST por email)

    Contas genéricas/de serviço (Helpdesk, etc.) NÃO entram aqui — permanecem
    visíveis conforme decisão da operação.
    """
    from app.services.metrics import _ANALYST_BLOCKLIST

    excluded: set[str] = set()
    engine = _sync_engine()
    try:
        users = pd.read_sql(text("SELECT email, name, active FROM zammad_users"), con=engine)
    except Exception:
        return excluded  # tabela ainda não existe (1º boot) → não filtra

    blocklist = {e.lower() for e in _ANALYST_BLOCKLIST}
    for _, u in users.iterrows():
        name  = _norm_name(u.get("name") or "")
        email = (u.get("email") or "").strip().lower()
        if not name:
            continue
        is_inactive = not bool(u.get("active", True))
        is_blocked  = email in blocklist
        if is_inactive or is_blocked:
            excluded.add(name)
    return excluded


def _stats_dict(series: pd.Series, prefix: str) -> dict:
    s = series.dropna()
    if s.empty:
        return {}
    return {
        f"{prefix}_mean_h":   round(float(s.mean()),           2),
        f"{prefix}_p50_h":    round(float(s.quantile(0.50)),   2),
        f"{prefix}_p90_h":    round(float(s.quantile(0.90)),   2),
        f"{prefix}_p95_h":    round(float(s.quantile(0.95)),   2),
        f"{prefix}_mean_fmt": fmt_h(s.mean()),
        f"{prefix}_p50_fmt":  fmt_h(s.quantile(0.50)),
        f"{prefix}_p90_fmt":  fmt_h(s.quantile(0.90)),
    }


# ── Construção da linha do tempo ──────────────────────────────────────────────

def _norm(ts) -> datetime | None:
    """Normaliza qualquer timestamp para datetime naive (sem timezone)."""
    if ts is None:
        return None
    if isinstance(ts, pd.Timestamp):
        ts = ts.to_pydatetime()
    if isinstance(ts, datetime) and ts.tzinfo:
        ts = ts.replace(tzinfo=None)
    return ts


def build_timeline(created_at: datetime, events_df: pd.DataFrame,
                   closed_at: datetime | None = None) -> pd.DataFrame:
    """
    Transforma os eventos brutos em uma linha do tempo de períodos.

    Cada linha do DataFrame resultante representa um PERÍODO contínuo com
    o mesmo responsável e estado. Colunas:

      start_ts  | end_ts | owner | state | category | wall_h | biz_h

    category:
      'com_analista'         — ticket com dono, estado ativo
      'aguardando_cliente'   — aguardando resposta do cliente
      'aguardando_terceiros' — aguardando terceiros / fornecedor
      'sem_dono'             — na fila, sem analista atribuído
    """
    # Fim da timeline: close_at se fechado, senão agora
    now = _norm(closed_at) if closed_at else datetime.now()

    # ── 1. Checkpoints: lista de (ts, field, value) ───────────────────────────
    checkpoints = []

    if created_at:
        checkpoints.append({"ts": _norm(created_at), "field": "state", "value": "new"})

    if not events_df.empty:
        for _, row in events_df.iterrows():
            field = (row.get("field") or "").lower()
            if field not in ("state", "owner", "owner_id"):
                continue
            # Normaliza: owner_id → owner
            field_n = "owner" if "owner" in field else "state"
            checkpoints.append({
                "ts":    _norm(row["created_at"]),
                "field": field_n,
                "value": str(row.get("value_to") or ""),
            })

    if not checkpoints:
        return pd.DataFrame()

    checkpoints.sort(key=lambda x: x["ts"])

    # ── 2. Reconstrói estado completo em cada checkpoint ──────────────────────
    cur_owner = ""
    cur_state = "new"
    segments  = []

    for cp in checkpoints:
        if cp["field"] == "state":
            cur_state = cp["value"]
        else:
            cur_owner = cp["value"]
        segments.append({"start_ts": cp["ts"], "owner": cur_owner, "state": cur_state})

    df = pd.DataFrame(segments)

    # end_ts = próximo start_ts; último período → agora
    df["end_ts"] = df["start_ts"].shift(-1)
    df.loc[df.index[-1], "end_ts"] = now
    df["end_ts"] = pd.to_datetime(df["end_ts"])  # mantém naive

    # ── 3. Categoriza cada período ────────────────────────────────────────────
    def _cat(row) -> str:
        s = (row["state"] or "").lower().strip()
        if "cliente"   in s: return "aguardando_cliente"
        if "terceiro"  in s: return "aguardando_terceiros"
        if row["owner"]:     return "com_analista"
        return "sem_dono"

    df["category"] = df.apply(_cat, axis=1)

    # ── 4. Durações ───────────────────────────────────────────────────────────
    df["wall_h"] = df.apply(lambda r: wall_hours(r["start_ts"], r["end_ts"]), axis=1)
    df["biz_h"]  = df.apply(lambda r: biz_hours(r["start_ts"],  r["end_ts"]),  axis=1)

    return df[["start_ts", "end_ts", "owner", "state", "category", "wall_h", "biz_h"]]


def _segments_fast(created_at, events, closed_at):
    """
    Versão leve (Python puro, sem pandas) de build_timeline para uso em lote.

    events: lista de tuplas (field, value_to, ts_norm) já ordenada por ts.
    Retorna lista de (owner, category, biz_h, wall_h) por período.
    Muito mais rápida que build_timeline quando chamada para milhares de tickets.
    """
    now = closed_at if closed_at else datetime.now()

    checkpoints = []
    if created_at:
        checkpoints.append(("state", "new", created_at))
    for field, value_to, ts in events:
        f = (field or "").lower()
        if f not in ("state", "owner", "owner_id"):
            continue
        if closed_at is not None and ts is not None and ts > closed_at:
            continue
        field_n = "owner" if "owner" in f else "state"
        checkpoints.append((field_n, str(value_to or ""), ts))

    if not checkpoints:
        return []

    checkpoints.sort(key=lambda x: (x[2] is None, x[2]))

    cur_owner, cur_state = "", "new"
    points = []  # (ts, owner, state)
    for field_n, value, ts in checkpoints:
        if field_n == "state":
            cur_state = value
        else:
            cur_owner = value
        points.append((ts, cur_owner, cur_state))

    out = []
    for i, (ts, owner, state) in enumerate(points):
        end_ts = points[i + 1][0] if i + 1 < len(points) else now
        s = (state or "").lower().strip()
        if "cliente" in s:
            cat = "aguardando_cliente"
        elif "terceiro" in s:
            cat = "aguardando_terceiros"
        elif owner:
            cat = "com_analista"
        else:
            cat = "sem_dono"
        out.append((owner, cat, biz_hours(ts, end_ts), wall_hours(ts, end_ts)))
    return out


def _ticket_fcr(created_at, events, closed_at):
    """
    Avalia FCR (First Contact Resolution) de um ticket.

    Retorna (resolving_owner, was_resolved, reopened):
      • resolving_owner — dono no momento em que o ticket foi resolvido pela 1ª vez
      • was_resolved    — chegou a um estado resolvido/fechado?
      • reopened        — depois de resolvido, voltou para um estado ativo?

    FCR = resolvido E não reabriu.
    """
    checkpoints = []
    if created_at:
        checkpoints.append(("state", "new", created_at))
    for field, value_to, ts in events:
        f = (field or "").lower()
        if f not in ("state", "owner", "owner_id"):
            continue
        if closed_at is not None and ts is not None and ts > closed_at:
            continue
        field_n = "owner" if "owner" in f else "state"
        checkpoints.append((field_n, str(value_to or ""), ts))

    if not checkpoints:
        return (None, False, False)

    checkpoints.sort(key=lambda x: (x[2] is None, x[2]))

    cur_owner = ""
    resolving_owner = None
    was_resolved = False
    reopened = False

    for field_n, value, _ in checkpoints:
        if field_n == "owner":
            cur_owner = value
            continue
        canon = _map_state(value)
        is_res         = canon in ("resolvido", "fechado")
        is_active_work = canon in ("em_atendimento", "escalonado", "novo")
        if is_res and not was_resolved:
            was_resolved = True
            resolving_owner = cur_owner
        elif was_resolved and is_active_work:
            # Reabertura = voltou para trabalho ativo do analista após resolver.
            # Espera de confirmação (ag. cliente/terceiros) NÃO conta como reabrir.
            reopened = True

    return (resolving_owner, was_resolved, reopened)


# ── Jornada completa de um ticket ─────────────────────────────────────────────

def compute_ticket_journey(ticket_id: int) -> dict:
    """
    Retorna a jornada completa de um ticket:
      • Linha do tempo (timeline) por período
      • MTTR em horas corridas e úteis
      • MTTA em horas corridas e úteis
      • Handoffs: tempo por analista e por categoria de espera
    """
    engine = _sync_engine()

    # ── Carrega ticket ────────────────────────────────────────────────────────
    t_row = pd.read_sql(
        text("SELECT * FROM tickets WHERE id = :tid"),
        con=engine, params={"tid": ticket_id}
    )
    if t_row.empty:
        return {"error": "ticket not found", "ticket_id": ticket_id}

    ticket     = t_row.iloc[0].to_dict()
    created_at = _norm(_to_ts(ticket.get("created_at")))
    closed_at  = _norm(_to_ts(ticket.get("close_at")))

    # ── Carrega eventos de histórico ─────────────────────────────────────────
    ev_df = pd.read_sql(
        text("""
            SELECT field, value_from, value_to, created_at, created_by
            FROM ticket_events
            WHERE ticket_id = :tid
              AND field IN ('state', 'owner', 'owner_id')
            ORDER BY created_at
        """),
        con=engine, params={"tid": ticket_id}
    )
    if not ev_df.empty:
        ev_df["created_at"] = pd.to_datetime(ev_df["created_at"], utc=True, errors="coerce")

    # ── Linha do tempo ────────────────────────────────────────────────────────
    # Filtra eventos posteriores ao fechamento (evita períodos fantasma)
    if closed_at is not None and not ev_df.empty:
        ev_df = ev_df[ev_df["created_at"].apply(_norm) <= closed_at]
    timeline = build_timeline(created_at, ev_df, closed_at=closed_at)

    # ── MTTR ─────────────────────────────────────────────────────────────────
    mttr_wall = wall_hours(created_at, closed_at) if closed_at else None
    mttr_biz  = biz_hours(created_at, closed_at)  if closed_at else None

    # ── MTTA — primeira ação de analista ─────────────────────────────────────
    mtta_wall = mtta_biz = None
    if not timeline.empty and created_at:
        first = timeline[
            (timeline["owner"].str.strip() != "") |
            (~timeline["state"].str.lower().isin(["new", ""]))
        ]
        if not first.empty:
            first_ts  = _to_ts(first.iloc[0]["start_ts"])
            mtta_wall = wall_hours(created_at, first_ts)
            mtta_biz  = biz_hours(created_at, first_ts)

    # ── Handoffs ──────────────────────────────────────────────────────────────
    handoffs = []
    if not timeline.empty:
        # Tempo total por analista (agrega múltiplos períodos do mesmo dono)
        analysts = (
            timeline[timeline["owner"].str.strip() != ""]
            .groupby("owner")[["wall_h", "biz_h"]]
            .sum()
            .reset_index()
            .sort_values("biz_h", ascending=False)
        )
        for _, r in analysts.iterrows():
            handoffs.append({
                "name":     r["owner"],
                "type":     "analyst",
                "wall_h":   round(float(r["wall_h"]), 2),
                "biz_h":    round(float(r["biz_h"]),  2),
                "wall_fmt": fmt_h(r["wall_h"]),
                "biz_fmt":  fmt_h(r["biz_h"]),
            })

        # Tempo em espera por categoria
        for cat, label in [
            ("aguardando_cliente",   "Aguardando Cliente"),
            ("aguardando_terceiros", "Aguardando Terceiros"),
        ]:
            sub = timeline[timeline["category"] == cat]
            if not sub.empty:
                wh = float(sub["wall_h"].sum())
                bh = float(sub["biz_h"].sum())
                handoffs.append({
                    "name":     label,
                    "type":     "waiting",
                    "wall_h":   round(wh, 2),
                    "biz_h":    round(bh, 2),
                    "wall_fmt": fmt_h(wh),
                    "biz_fmt":  fmt_h(bh),
                })

    # ── Serializa timeline ────────────────────────────────────────────────────
    tl_rows = []
    if not timeline.empty:
        for _, r in timeline.iterrows():
            tl_rows.append({
                "start":    str(r["start_ts"]),
                "end":      str(r["end_ts"]),
                "owner":    r["owner"],
                "state":    r["state"],
                "category": r["category"],
                "wall_h":   round(float(r["wall_h"]), 2),
                "biz_h":    round(float(r["biz_h"]),  2),
                "wall_fmt": fmt_h(r["wall_h"]),
                "biz_fmt":  fmt_h(r["biz_h"]),
            })

    return {
        "ticket_id": ticket_id,
        "number":    ticket.get("number"),
        "title":     ticket.get("title"),
        "state":     ticket.get("state"),
        "owner":     ticket.get("owner"),
        "created_at": str(created_at) if created_at else None,
        "closed_at":  str(closed_at)  if closed_at  else None,
        "mttr": {
            "wall_h":   mttr_wall,
            "biz_h":    mttr_biz,
            "wall_fmt": fmt_h(mttr_wall),
            "biz_fmt":  fmt_h(mttr_biz),
        },
        "mtta": {
            "wall_h":   mtta_wall,
            "biz_h":    mtta_biz,
            "wall_fmt": fmt_h(mtta_wall),
            "biz_fmt":  fmt_h(mtta_biz),
        },
        "handoffs": handoffs,
        "timeline": tl_rows,
    }


# ── Estatísticas agregadas ────────────────────────────────────────────────────

def _resolve(start_date: str, end_date: str):
    today = datetime.now(timezone.utc).date().isoformat()
    end_s = (
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        if end_date >= today else f"{end_date} 23:59:59"
    )
    return f"{start_date} 00:00:00", end_s


def _group_filter_sql() -> str:
    """
    Cláusula SQL para excluir grupos não-operacionais (Informativo, Portabilidade,
    etc.) das métricas — mantém consistência com Volume por Grupo e Analistas.
    Retorna '' se a blocklist estiver vazia.
    """
    blocked = ", ".join("'" + g.replace("'", "''") + "'" for g in _GROUP_BLOCKLIST_JOURNEY)
    return f" AND LOWER(TRIM(COALESCE(\"group\", ''))) NOT IN ({blocked})" if blocked else ""


def compute_mttr_stats(start_date: str, end_date: str) -> dict:
    """
    Estatísticas de MTTR (horas corridas + úteis) para tickets
    fechados no período informado.
    """
    start_s, end_s = _resolve(start_date, end_date)
    engine = _sync_engine()

    df = pd.read_sql(
        text(f"""
            SELECT id, created_at, close_at
            FROM tickets
            WHERE close_at IS NOT NULL
              AND datetime(close_at) >= datetime(:start)
              AND datetime(close_at) <= datetime(:end)
              {_group_filter_sql()}
        """),
        con=engine, params={"start": start_s, "end": end_s},
    )

    if df.empty:
        return {"count": 0, "start_date": start_date, "end_date": end_date}

    df["created_at"] = pd.to_datetime(df["created_at"], utc=True, errors="coerce")
    df["close_at"]   = pd.to_datetime(df["close_at"],   utc=True, errors="coerce")

    df["wall_h"] = df.apply(lambda r: wall_hours(r["created_at"], r["close_at"]), axis=1)
    df["biz_h"]  = df.apply(lambda r: biz_hours(r["created_at"],  r["close_at"]),  axis=1)

    return {
        "count":      len(df),
        "start_date": start_date,
        "end_date":   end_date,
        **_stats_dict(df["wall_h"], "wall"),
        **_stats_dict(df["biz_h"],  "biz"),
    }


def compute_mtta_stats(start_date: str, end_date: str) -> dict:
    """
    Estatísticas de MTTA (horas corridas + úteis) para tickets criados
    no período que possuem ao menos um evento de histórico registrado.
    """
    start_s, end_s = _resolve(start_date, end_date)
    engine = _sync_engine()

    # Tickets criados no período (exclui grupos não-operacionais)
    tickets_df = pd.read_sql(
        text(f"""
            SELECT id, created_at
            FROM tickets
            WHERE datetime(created_at) >= datetime(:start)
              AND datetime(created_at) <= datetime(:end)
              {_group_filter_sql()}
        """),
        con=engine, params={"start": start_s, "end": end_s},
    )

    if tickets_df.empty:
        return {"count": 0, "start_date": start_date, "end_date": end_date}

    tickets_df["created_at"] = pd.to_datetime(tickets_df["created_at"], utc=True, errors="coerce")
    ticket_ids = tickets_df["id"].tolist()

    # Primeiro evento de analista (state != 'new' ou owner atribuído)
    placeholders = ",".join(str(i) for i in ticket_ids)
    events_df = pd.read_sql(
        text(f"""
            SELECT ticket_id, MIN(created_at) AS first_action_at
            FROM ticket_events
            WHERE ticket_id IN ({placeholders})
              AND (
                  (field = 'state'  AND LOWER(value_to) != 'new')
               OR (field = 'owner'  AND value_to != '')
              )
            GROUP BY ticket_id
        """),
        con=engine,
    )

    if events_df.empty:
        return {"count": 0, "start_date": start_date, "end_date": end_date,
                "note": "nenhum evento de histórico disponível — execute o sync completo de histórico"}

    events_df["first_action_at"] = pd.to_datetime(events_df["first_action_at"], utc=True, errors="coerce")

    merged = tickets_df.merge(events_df, left_on="id", right_on="ticket_id", how="inner")
    merged["wall_h"] = merged.apply(lambda r: wall_hours(r["created_at"], r["first_action_at"]), axis=1)
    merged["biz_h"]  = merged.apply(lambda r: biz_hours(r["created_at"],  r["first_action_at"]),  axis=1)

    return {
        "count":      len(merged),
        "start_date": start_date,
        "end_date":   end_date,
        **_stats_dict(merged["wall_h"], "wall"),
        **_stats_dict(merged["biz_h"],  "biz"),
    }


# ── SLA ──────────────────────────────────────────────────────────────────────

def compute_sla_stats(start_date: str, end_date: str) -> dict:
    """
    % de tickets fechados dentro do prazo SLA (close_at <= sla_solution_at).
    Considera apenas tickets fechados no período com sla_solution_at definido.
    """
    start_s, end_s = _resolve(start_date, end_date)
    engine = _sync_engine()

    df = pd.read_sql(
        text("""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN sla_solution_at IS NOT NULL
                          AND datetime(close_at) <= datetime(sla_solution_at)
                     THEN 1 ELSE 0 END) AS met
            FROM tickets
            WHERE close_at IS NOT NULL
              AND datetime(close_at) >= datetime(:start)
              AND datetime(close_at) <= datetime(:end)
        """),
        con=engine, params={"start": start_s, "end": end_s},
    )

    total = int(df.iloc[0]["total"] or 0)
    met   = int(df.iloc[0]["met"]   or 0)
    sla_pct = round(met / total * 100, 1) if total > 0 else 0.0

    return {
        "count":    total,
        "met":      met,
        "sla_pct":  sla_pct,
        "start_date": start_date,
        "end_date":   end_date,
    }


# ── Volume por status (entrantes / saintes) ───────────────────────────────────

# Mapa de estado Zammad → chave canônica do frontend
_STATE_MAP = {
    "new":                    "novo",
    "open":                   "em_atendimento",
    "aberto":                 "em_atendimento",
    "em atendimento":         "em_atendimento",
    "aguardando cliente":     "ag_cliente",
    "ag. cliente":            "ag_cliente",
    "aguardando terceiros":   "ag_terceiros",
    "ag. terceiros":          "ag_terceiros",
    "escalonado dev":         "escalonado",
    "escalonado rotas":       "escalonado",
    "escalonado infra":       "escalonado",
    "resolvido":              "resolvido",
    "resolved":               "resolvido",
    "closed":                 "fechado",
    "fechado":                "fechado",
    "merged":                 "fechado",
}

def _map_state(s: str) -> str:
    return _STATE_MAP.get((s or "").lower().strip(), "outros")


def compute_volume_by_status(start_date: str, end_date: str) -> dict:
    """
    Contagem de tickets do período separada em dois blocos:
      entrantes — criados no período, agrupados por estado atual
      saintes   — fechados/resolvidos no período
    """
    start_s, end_s = _resolve(start_date, end_date)
    engine = _sync_engine()

    # Entrantes: criados no período
    inc_df = pd.read_sql(
        text("""
            SELECT state, COUNT(*) AS n
            FROM tickets
            WHERE datetime(created_at) >= datetime(:start)
              AND datetime(created_at) <= datetime(:end)
            GROUP BY state
        """),
        con=engine, params={"start": start_s, "end": end_s},
    )

    # Saintes: fechados no período
    out_df = pd.read_sql(
        text("""
            SELECT state, COUNT(*) AS n
            FROM tickets
            WHERE close_at IS NOT NULL
              AND datetime(close_at) >= datetime(:start)
              AND datetime(close_at) <= datetime(:end)
            GROUP BY state
        """),
        con=engine, params={"start": start_s, "end": end_s},
    )

    def _aggregate(df: pd.DataFrame) -> dict:
        buckets: dict[str, int] = {}
        for _, row in df.iterrows():
            key = _map_state(str(row["state"]))
            buckets[key] = buckets.get(key, 0) + int(row["n"])
        return buckets

    inc_buckets = _aggregate(inc_df)
    out_buckets = _aggregate(out_df)

    return {
        "start_date": start_date,
        "end_date":   end_date,
        "entrantes": {
            "total":    sum(inc_buckets.values()),
            "by_state": inc_buckets,
        },
        "saintes": {
            "total":    sum(out_buckets.values()),
            "by_state": out_buckets,
        },
    }


# ── Volume por Grupo do Zammad ────────────────────────────────────────────────

# Fonte única da blocklist de grupos não-operacionais — importada de metrics.py
# para que ajustes feitos lá valham automaticamente também aqui.
from app.services.metrics import _OFFENDER_GROUP_BLOCKLIST as _GROUP_BLOCKLIST_JOURNEY


def compute_volume_by_group(start_date: str, end_date: str) -> dict:
    """
    Retorna tickets do período agrupados pelos Grupos do Zammad.

    Cada entrada contém:
      name     — nome do grupo (tal como registrado no Zammad)
      total    — total de tickets criados no período neste grupo
      by_state — quebra canônica por estado (em_atendimento, ag_cliente, …)

    Os grupos são lidos dinamicamente da base — novos grupos criados no Zammad
    aparecem automaticamente na resposta sem alterar o código.
    """
    start_s, end_s = _resolve(start_date, end_date)
    engine = _sync_engine()

    df = pd.read_sql(
        text("""
            SELECT "group", state, COUNT(*) AS n
            FROM tickets
            WHERE datetime(created_at) >= datetime(:start)
              AND datetime(created_at) <= datetime(:end)
              AND "group" IS NOT NULL
              AND TRIM("group") != ''
            GROUP BY "group", state
        """),
        con=engine, params={"start": start_s, "end": end_s},
    )

    if df.empty:
        return {"start_date": start_date, "end_date": end_date, "groups": []}

    # Exclui grupos não-operacionais
    df = df[~df["group"].str.lower().str.strip().isin(_GROUP_BLOCKLIST_JOURNEY)]

    groups = []
    for group_name, gdf in df.groupby("group"):
        by_state: dict[str, int] = {}
        for _, row in gdf.iterrows():
            key = _map_state(str(row["state"]))
            by_state[key] = by_state.get(key, 0) + int(row["n"])
        groups.append({
            "name":     group_name,
            "total":    sum(by_state.values()),
            "by_state": dict(sorted(by_state.items(), key=lambda x: -x[1])),
        })

    # Ordena por volume decrescente
    groups.sort(key=lambda g: -g["total"])

    return {"start_date": start_date, "end_date": end_date, "groups": groups}


# ── Desempenho por analista ───────────────────────────────────────────────────

def compute_analyst_performance(start_date: str, end_date: str) -> dict:
    """
    Para cada analista que tocou em tickets criados no período:
      tickets_count  — quantidade de tickets distintos
      active_biz_h   — horas úteis com o ticket em estado ativo (com_analista)
      waiting_biz_h  — horas úteis aguardando cliente ou terceiros
      active_fmt / waiting_fmt — versões formatadas
    """
    start_s, end_s = _resolve(start_date, end_date)
    engine = _sync_engine()

    # Carrega tickets do período — exclui grupos não-operacionais (mais rápido + correto)
    blocked = ", ".join("'" + g.replace("'", "''") + "'" for g in _GROUP_BLOCKLIST_JOURNEY)
    grp_filter = (
        f" AND LOWER(TRIM(COALESCE(\"group\", ''))) NOT IN ({blocked})" if blocked else ""
    )
    tickets_df = pd.read_sql(
        text(f"""
            SELECT id, created_at, close_at
            FROM tickets
            WHERE datetime(created_at) >= datetime(:start)
              AND datetime(created_at) <= datetime(:end)
              {grp_filter}
        """),
        con=engine, params={"start": start_s, "end": end_s},
    )

    if tickets_df.empty:
        return {"start_date": start_date, "end_date": end_date, "analysts": []}

    tickets_df["created_at"] = pd.to_datetime(tickets_df["created_at"], errors="coerce")
    tickets_df["close_at"]   = pd.to_datetime(tickets_df["close_at"],   errors="coerce")
    ticket_ids = tickets_df["id"].tolist()

    # Carrega TODOS os eventos em uma query só
    placeholders = ",".join(str(i) for i in ticket_ids)
    events_df = pd.read_sql(
        text(f"""
            SELECT ticket_id, field, value_to, created_at
            FROM ticket_events
            WHERE ticket_id IN ({placeholders})
              AND field IN ('state', 'owner', 'owner_id')
            ORDER BY ticket_id, created_at
        """),
        con=engine,
    )

    # Agrupa eventos por ticket UMA vez (O(n)) — evita varredura O(n²) no loop
    events_by_ticket: dict[int, list] = {}
    if not events_df.empty:
        for tid_, field_, vto_, ts_ in zip(
            events_df["ticket_id"].tolist(),
            events_df["field"].tolist(),
            events_df["value_to"].tolist(),
            pd.to_datetime(events_df["created_at"], errors="coerce").tolist(),
        ):
            events_by_ticket.setdefault(int(tid_), []).append(
                (field_, vto_, _norm(ts_))
            )

    # Agrega por analista
    analyst_stats: dict[str, dict] = {}

    for tid_, created_raw, closed_raw in zip(
        tickets_df["id"].tolist(),
        tickets_df["created_at"].tolist(),
        tickets_df["close_at"].tolist(),
    ):
        tid        = int(tid_)
        created_at = _norm(_to_ts(created_raw))
        closed_at  = _norm(_to_ts(closed_raw))
        evs        = events_by_ticket.get(tid, [])

        def _ensure(owner):
            if owner not in analyst_stats:
                analyst_stats[owner] = {
                    "tickets": set(),
                    "active_biz": 0.0,  "active_wall": 0.0,
                    "cli_biz": 0.0,     "cli_wall": 0.0,
                    "ter_biz": 0.0,     "ter_wall": 0.0,
                    "resolved": 0,      "fcr": 0,
                }
            return analyst_stats[owner]

        for owner, cat, biz_h, wall_h in _segments_fast(created_at, evs, closed_at):
            owner = (owner or "").strip()
            if not owner:
                continue
            st = _ensure(owner)
            st["tickets"].add(tid)
            if cat == "com_analista":
                st["active_biz"]  += biz_h
                st["active_wall"] += wall_h
            elif cat == "aguardando_cliente":
                st["cli_biz"]  += biz_h
                st["cli_wall"] += wall_h
            elif cat == "aguardando_terceiros":
                st["ter_biz"]  += biz_h
                st["ter_wall"] += wall_h

        # ── FCR: atribui ao analista que resolveu ──
        resolving_owner, was_resolved, reopened = _ticket_fcr(created_at, evs, closed_at)
        resolving_owner = (resolving_owner or "").strip()
        if was_resolved and resolving_owner:
            st = _ensure(resolving_owner)
            st["resolved"] += 1
            if not reopened:
                st["fcr"] += 1

    # Filtra analistas inativos / não-operacionais (mantém contas genéricas)
    excluded_names = _inactive_analyst_names()

    analysts = [
        {
            "owner":           owner,
            "tickets_count":   len(s["tickets"]),
            # ── Horas úteis ──
            "active_biz_h":    round(s["active_biz"], 2),
            "active_fmt":      fmt_h(s["active_biz"]),
            "ag_cliente_biz_h":   round(s["cli_biz"], 2),
            "ag_cliente_fmt":     fmt_h(s["cli_biz"]),
            "ag_terceiros_biz_h": round(s["ter_biz"], 2),
            "ag_terceiros_fmt":   fmt_h(s["ter_biz"]),
            # Soma das duas esperas (compatibilidade / total)
            "waiting_biz_h":   round(s["cli_biz"] + s["ter_biz"], 2),
            "waiting_fmt":     fmt_h(s["cli_biz"] + s["ter_biz"]),
            # ── Horas corridas ──
            "active_wall_h":   round(s["active_wall"], 2),
            "active_wall_fmt": fmt_h(s["active_wall"]),
            "ag_cliente_wall_h":   round(s["cli_wall"], 2),
            "ag_cliente_wall_fmt": fmt_h(s["cli_wall"]),
            "ag_terceiros_wall_h": round(s["ter_wall"], 2),
            "ag_terceiros_wall_fmt": fmt_h(s["ter_wall"]),
            "waiting_wall_h":   round(s["cli_wall"] + s["ter_wall"], 2),
            "waiting_wall_fmt": fmt_h(s["cli_wall"] + s["ter_wall"]),
            # ── FCR ── % resolvidos sem reabrir (None se o analista não resolveu nada)
            "fcr_pct": round(s["fcr"] / s["resolved"] * 100) if s["resolved"] else None,
        }
        for owner, s in sorted(analyst_stats.items(), key=lambda x: -len(x[1]["tickets"]))
        if _norm_name(owner) not in excluded_names
    ]

    return {"start_date": start_date, "end_date": end_date, "analysts": analysts}


# ── Histórico mensal (para mini-gráficos) ─────────────────────────────────────

def _months_back(months_count: int) -> list[tuple[str, str, str]]:
    """Retorna lista de (ym, start_date, end_date, label) dos últimos N meses."""
    from calendar import monthrange as _mr
    now = datetime.now(timezone.utc)
    result = []
    for i in range(months_count - 1, -1, -1):
        year  = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year  -= 1
        ym    = f"{year:04d}-{month:02d}"
        last  = _mr(year, month)[1]
        names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
        label = f"{names[month - 1]}/{str(year)[2:]}"
        result.append((ym, f"{ym}-01", f"{ym}-{last:02d}", label))
    return result


def compute_mttr_history(months_count: int = 6) -> dict:
    """MTTR (biz + wall + p90) para cada um dos últimos N meses."""
    months = []
    for ym, start, end, label in _months_back(months_count):
        s = compute_mttr_stats(start, end)
        months.append({
            "month":       ym,
            "label":       label,
            "count":       s.get("count", 0),
            "biz_mean_h":  s.get("biz_mean_h"),
            "wall_mean_h": s.get("wall_mean_h"),
            "biz_p90_h":   s.get("biz_p90_h"),
        })
    return {"months_count": months_count, "months": months}


def compute_sla_history(months_count: int = 6) -> dict:
    """SLA % para cada um dos últimos N meses."""
    months = []
    for ym, start, end, label in _months_back(months_count):
        s = compute_sla_stats(start, end)
        months.append({
            "month":   ym,
            "label":   label,
            "count":   s.get("count", 0),
            "sla_pct": s.get("sla_pct"),
        })
    return {"months_count": months_count, "months": months}


# ── Histórico por intervalo de datas (bucketing automático) ───────────────────

def _date_buckets(start_date: str, end_date: str) -> list[tuple[str, str, str]]:
    """
    Divide o intervalo [start, end] em buckets, escolhendo a granularidade:
      ≤ 31 dias  → diário
      ≤ 120 dias → semanal
      > 120 dias → mensal
    Retorna lista de (start, end, label).
    """
    from datetime import date as _date, timedelta as _td
    from calendar import monthrange as _mr

    d0 = _date.fromisoformat(start_date)
    d1 = _date.fromisoformat(end_date)
    if d1 < d0:
        d0, d1 = d1, d0
    span = (d1 - d0).days + 1

    buckets: list[tuple[str, str, str]] = []
    names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

    if span <= 31:
        # diário
        cur = d0
        while cur <= d1:
            buckets.append((cur.isoformat(), cur.isoformat(),
                            f"{cur.day:02d}/{cur.month:02d}"))
            cur += _td(days=1)
    elif span <= 120:
        # semanal
        cur = d0
        while cur <= d1:
            wk_end = min(cur + _td(days=6), d1)
            buckets.append((cur.isoformat(), wk_end.isoformat(),
                            f"{cur.day:02d}/{cur.month:02d}"))
            cur = wk_end + _td(days=1)
    else:
        # mensal
        y, m = d0.year, d0.month
        while (y, m) <= (d1.year, d1.month):
            last = _mr(y, m)[1]
            b_start = max(_date(y, m, 1), d0).isoformat()
            b_end   = min(_date(y, m, last), d1).isoformat()
            buckets.append((b_start, b_end, f"{names[m - 1]}/{str(y)[2:]}"))
            m += 1
            if m > 12:
                m = 1; y += 1

    return buckets


def compute_history_range(metric: str, start_date: str, end_date: str) -> dict:
    """
    Histórico de uma métrica num intervalo de datas arbitrário, com
    granularidade automática (diária / semanal / mensal).

    metric: 'mttr' | 'sla' | 'mtta' | 'volume'
    """
    from datetime import date as _date
    span = (_date.fromisoformat(end_date) - _date.fromisoformat(start_date)).days + 1
    granularity = "diário" if span <= 31 else "semanal" if span <= 120 else "mensal"

    buckets = _date_buckets(start_date, end_date)
    points = []

    for b_start, b_end, label in buckets:
        pt = {"start": b_start, "end": b_end, "label": label}
        if metric == "mttr":
            s = compute_mttr_stats(b_start, b_end)
            pt.update({
                "count":       s.get("count", 0),
                "biz_mean_h":  s.get("biz_mean_h"),
                "wall_mean_h": s.get("wall_mean_h"),
                "biz_p90_h":   s.get("biz_p90_h"),
            })
        elif metric == "mtta":
            s = compute_mtta_stats(b_start, b_end)
            pt.update({
                "count":       s.get("count", 0),
                "biz_mean_h":  s.get("biz_mean_h"),
                "wall_mean_h": s.get("wall_mean_h"),
                "biz_p90_h":   s.get("biz_p90_h"),
            })
        elif metric == "sla":
            s = compute_sla_stats(b_start, b_end)
            pt.update({
                "count":   s.get("count", 0),
                "sla_pct": s.get("sla_pct"),
            })
        elif metric == "volume":
            s = compute_volume_by_status(b_start, b_end)
            pt.update({
                "criados":  s.get("entrantes", {}).get("total", 0),
                "fechados": s.get("saintes",   {}).get("total", 0),
                "count":    s.get("entrantes", {}).get("total", 0),
            })
        points.append(pt)

    return {
        "metric":      metric,
        "start_date":  start_date,
        "end_date":    end_date,
        "granularity": granularity,
        "points":      points,
    }
