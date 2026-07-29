import { useCallback } from 'react'
import { getFRTToday } from '../api/client'
import { usePolling } from '../hooks/usePolling'

const STATUS_CONFIG = {
  good:     { color: 'text-emerald-400', ring: 'ring-emerald-500/40', label: 'Dentro do SLA' },
  warning:  { color: 'text-yellow-400',  ring: 'ring-yellow-500/40',  label: 'Atenção'        },
  critical: { color: 'text-red-400',     ring: 'ring-red-500/40',     label: 'Crítico'        },
}

export default function FRTGauge() {
  const fetchFn = useCallback(getFRTToday, [])
  const { data, loading } = usePolling(fetchFn, 90_000)

  const cfg    = STATUS_CONFIG[data?.status ?? 'good']
  const frt    = data?.mean_formatted ?? '—'
  const count  = data?.count ?? 0

  return (
    <div className={`noc-card ring-1 ${cfg.ring} flex flex-col items-center gap-2 py-5 min-w-[140px]`}>
      <h2 className="text-xs uppercase tracking-widest text-noc-muted">FRT Hoje</h2>
      <span className={`text-4xl font-black tabular-nums ${cfg.color} ${loading ? 'opacity-40' : ''}`}>
        {loading ? '…' : frt}
      </span>
      <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
      <span className="text-xs text-noc-muted">{count} medição{count !== 1 ? 'ões' : ''}</span>
    </div>
  )
}
