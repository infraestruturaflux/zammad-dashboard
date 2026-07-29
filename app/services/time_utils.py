"""
Utilitários de cálculo de tempo para métricas de NOC.

  wall_hours(start, end)          → horas corridas (relógio 24h)
  biz_hours(start, end, holidays) → horas úteis (08h–19h, seg–sex)
  fmt_h(horas)                    → '2h 35min' | '45min' | '—'
"""

from datetime import datetime, timedelta

BDAY_START = 8    # 08h
BDAY_END   = 19   # 19h
BDAY_DAYS  = {0, 1, 2, 3, 4}   # seg=0 … sex=4


def _naive(dt: datetime) -> datetime | None:
    """Remove timezone — normaliza para comparação homogênea.

    Trata None e NaT (pandas) → None, evitando erro de comparação.
    """
    if dt is None:
        return None
    # pandas NaT / valores ausentes não são None, mas != a si mesmos (NaN-like)
    try:
        if dt != dt:          # NaT/NaN: x != x é True
            return None
    except Exception:
        pass
    tzinfo = getattr(dt, "tzinfo", None)
    return dt.replace(tzinfo=None) if tzinfo else dt


def wall_hours(start: datetime, end: datetime) -> float:
    """Horas corridas (24h) entre dois datetimes. Retorna 0.0 para entradas inválidas."""
    start, end = _naive(start), _naive(end)
    if not start or not end or start >= end:
        return 0.0
    return round((end - start).total_seconds() / 3600, 4)


def biz_hours(start: datetime, end: datetime, holidays: set | None = None) -> float:
    """
    Horas úteis entre dois datetimes.

    Regras:
    • Expediente: 08h–19h (configurável via BDAY_START / BDAY_END)
    • Dias úteis: segunda a sexta
    • Feriados: passados como conjunto de datetime.date

    Exemplo:
        biz_hours(
            datetime(2026, 5, 23, 8, 0),   # sexta 08h
            datetime(2026, 5, 25, 10, 0),  # domingo 10h
        )
        → 11.0  (sexta: 8h–19h = 11h; sábado/domingo: 0h)
    """
    start, end = _naive(start), _naive(end)
    if not start or not end or start >= end:
        return 0.0

    holidays = holidays or set()
    total    = 0.0
    cur      = start

    while cur.date() <= end.date():
        if cur.weekday() in BDAY_DAYS and cur.date() not in holidays:
            seg_s = max(cur, cur.replace(hour=BDAY_START, minute=0, second=0, microsecond=0))
            seg_e = min(end, cur.replace(hour=BDAY_END,   minute=0, second=0, microsecond=0))
            if seg_s < seg_e:
                total += (seg_e - seg_s).total_seconds()
        # Avança para o início do próximo dia
        cur = (cur + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    return round(total / 3600, 4)


def fmt_h(h: float | None) -> str:
    """Formata horas decimais como string legível: '2h 35min', '45min', '—'."""
    if h is None or (isinstance(h, float) and h != h):   # None ou NaN
        return "—"
    total_min = int(round(h * 60))
    hrs, mins = divmod(total_min, 60)
    if hrs > 0:
        return f"{hrs}h {mins}min" if mins else f"{hrs}h"
    return f"{mins}min"
