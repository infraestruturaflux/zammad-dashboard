"""
Backfill DIRECIONADO do histórico de eventos (ticket_events).

Busca o histórico apenas dos tickets OPERACIONAIS criados a partir de uma data
(default 2026-06-01) que ainda NÃO têm eventos — resolve FCR/MTTA de meses
passados muito mais rápido que o full_sync sequencial (Jan→Ago).

Uso (rodar DE DENTRO de /opt/noc-dashboard, onde está o app/ e o banco):
    cd /opt/noc-dashboard
    systemctl stop noc-dashboard
    .venv/bin/python /opt/zammad_dashboard_noc/scripts/backfill_events.py           # desde 2026-06-01
    .venv/bin/python /opt/zammad_dashboard_noc/scripts/backfill_events.py 2026-07-01
    systemctl start noc-dashboard

Precisa do backend PARADO para ter acesso exclusivo ao SQLite (evita lock).
"""
import asyncio
import os
import sys
from datetime import datetime

# Permite importar `app` a partir do diretório atual (ex: /opt/noc-dashboard)
sys.path.insert(0, os.getcwd())

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.database import AsyncSessionLocal
from app.models.ticket import Ticket
from app.models.ticket_event import TicketEvent
from app.services.metrics import _OFFENDER_GROUP_BLOCKLIST as BLOCK
from app.services.sync import _history_to_event_rows
from app.services.zammad_client import ZammadClient

SINCE = sys.argv[1] if len(sys.argv) > 1 else "2026-06-01"
CONC = 8   # requisições paralelas à API do Zammad


async def _fetch(client, tid):
    try:
        history = await client.get_ticket_history(tid)
        return tid, _history_to_event_rows(tid, history)
    except Exception as exc:      # noqa: BLE001
        print(f"  ! erro ticket {tid}: {exc}", flush=True)
        return tid, None


async def main():
    # 1) Alvos: tickets operacionais desde SINCE cujo histórico está INCOMPLETO —
    #    faltando o evento de DONO (owner/owner_id). Sem ele, o cálculo não liga o
    #    ticket ao analista nem detecta a resolução (FCR/MTTA nulos). Re-buscar o
    #    histórico completo é idempotente (só adiciona o que falta).
    async with AsyncSessionLocal() as s:
        have_owner = {
            r[0] for r in (await s.execute(
                select(TicketEvent.ticket_id)
                .where(TicketEvent.field.in_(["owner", "owner_id"]))
                .distinct()
            )).all()
        }
        rows = (await s.execute(
            select(Ticket.id, Ticket.group).where(
                Ticket.created_at >= datetime.fromisoformat(SINCE)
            )
        )).all()

    targets = [
        tid for tid, grp in rows
        if tid not in have_owner and (grp or "").lower().strip() not in BLOCK
    ]
    total = len(targets)
    print(f"[backfill] desde {SINCE}: {total} tickets operacionais sem evento de dono", flush=True)
    if not total:
        print("[backfill] nada a fazer.", flush=True)
        return

    # 2) Busca o histórico em lotes concorrentes e grava
    done = added = 0
    async with ZammadClient() as client:
        for i in range(0, total, CONC):
            batch = targets[i:i + CONC]
            results = await asyncio.gather(*[_fetch(client, t) for t in batch])
            async with AsyncSessionLocal() as s:
                for tid, ev in results:
                    done += 1
                    if ev:
                        for er in ev:
                            await s.execute(
                                sqlite_insert(TicketEvent).values(**er)
                                .on_conflict_do_nothing(index_elements=["id"])
                            )
                        added += 1
                await s.commit()
            if i // CONC % 25 == 0:
                print(f"  {done}/{total} processados · {added} com eventos novos", flush=True)

    print(f"[backfill] FIM — {done} processados, {added} tickets receberam eventos.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
