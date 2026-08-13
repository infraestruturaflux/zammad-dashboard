#!/usr/bin/env bash
# Backfill DIÁRIO do histórico de eventos (mantém FCR/MTTA corretos).
# Completa o histórico dos tickets dos últimos dias que ficaram sem evento de dono
# (o sync busca o histórico 1x só e não re-busca). Roda com o backend PARADO para
# ter acesso exclusivo ao SQLite. Agendar via cron 1x/dia, de madrugada.
#
# Instalar no cron (root), 04:00 todo dia:
#   ( crontab -l 2>/dev/null | grep -v backfill_daily ; \
#     echo "0 4 * * * /bin/bash /opt/zammad_dashboard_noc/scripts/backfill_daily.sh" ) | crontab -
set -u

RUNTIME=/opt/noc-dashboard
REPO=/opt/zammad_dashboard_noc
LOG="$RUNTIME/backfill_daily.log"
SINCE=$(date -d '4 days ago' +%Y-%m-%d)   # janela curta = rápido (só tickets recentes)

# Garante que o backend volte mesmo se o backfill falhar, travar ou for morto.
trap 'systemctl start noc-dashboard >/dev/null 2>&1' EXIT

{
  echo "===== $(date '+%F %T') · backfill desde $SINCE ====="
  systemctl stop noc-dashboard
  cd "$RUNTIME" || exit 1
  timeout 1800 "$RUNTIME/.venv/bin/python" "$REPO/scripts/backfill_events.py" "$SINCE"
  echo "===== $(date '+%F %T') · fim ====="
} >> "$LOG" 2>&1
