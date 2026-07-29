import { useCallback } from 'react'
import { getActivity } from '../api/client'
import { usePolling } from '../hooks/usePolling'

const TYPE_CONFIG = {
  created: { icon: '+', color: 'text-sky-400'     },
  updated: { icon: '↻', color: 'text-yellow-400'  },
  closed:  { icon: '✓', color: 'text-emerald-400' },
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)   return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

export default function LiveTicker() {
  const fetchFn = useCallback(() => getActivity(10), [])
  const { data, loading } = usePolling(fetchFn, 20_000)

  const events = data?.events ?? []

  return (
    <div className="noc-card flex flex-col gap-2 min-w-0">
      <h2 className="text-xs uppercase tracking-widest text-noc-muted">Batimento da Operação</h2>
      {loading && !events.length && (
        <div className="space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-noc-border rounded" />)}
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {events.map((e) => {
          const cfg = TYPE_CONFIG[e.event_type] ?? TYPE_CONFIG.updated
          return (
            <li key={`${e.ticket_id}-${e.happened_at}`}
              className="flex items-center gap-2 text-xs">
              <span className={`font-bold w-3 text-center shrink-0 ${cfg.color}`}>{cfg.icon}</span>
              <span className="font-mono text-noc-muted shrink-0">#{e.number}</span>
              <span className="text-white truncate flex-1">{e.title}</span>
              <span className="text-noc-muted shrink-0 tabular-nums">{timeAgo(e.happened_at)}</span>
            </li>
          )
        })}
      </ul>

      {/* Legenda dos ícones */}
      <div className="flex gap-4 pt-1 mt-1 border-t border-noc-border">
        <span className="flex items-center gap-1 text-[10px] text-noc-muted">
          <span className="font-bold text-sky-400">+</span> Aberto
        </span>
        <span className="flex items-center gap-1 text-[10px] text-noc-muted">
          <span className="font-bold text-yellow-400">↻</span> Atualizado
        </span>
        <span className="flex items-center gap-1 text-[10px] text-noc-muted">
          <span className="font-bold text-emerald-400">✓</span> Fechado
        </span>
      </div>
    </div>
  )
}
