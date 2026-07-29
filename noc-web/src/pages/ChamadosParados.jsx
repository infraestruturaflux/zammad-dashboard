import { useCallback, useState } from 'react'
import { getIdle } from '../api/client'
import { usePolling } from '../hooks/usePolling'

export default function ChamadosParados() {
  const [days, setDays] = useState(3)
  const fetchFn = useCallback(() => getIdle(days), [days])
  const { data, loading } = usePolling(fetchFn, 60_000)

  const zombies = data?.zombies ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-bold text-white">Chamados Parados</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-noc-muted">Inativo há mais de</span>
          {[1, 3, 7, 14].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2 py-0.5 rounded text-xs transition-colors
                ${days === d ? 'bg-sky-500/20 text-sky-400' : 'text-noc-muted hover:text-white'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="noc-card">
        {loading && <div className="h-32 bg-noc-border rounded animate-pulse" />}
        {!loading && !zombies.length && (
          <p className="text-noc-muted text-sm text-center py-8">
            Nenhum chamado parado há mais de {days} dia{days !== 1 ? 's' : ''}.
          </p>
        )}
        {zombies.length > 0 && (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-noc-border text-noc-muted uppercase tracking-wider">
                <th className="pb-2 pr-4">Ticket</th>
                <th className="pb-2 pr-4">Título</th>
                <th className="pb-2 pr-4">Analista</th>
                <th className="pb-2 pr-4">Grupo</th>
                <th className="pb-2 text-right">Parado há</th>
              </tr>
            </thead>
            <tbody>
              {zombies.map((z) => (
                <tr key={z.ticket_id} className="border-b border-noc-border/40 hover:bg-white/[.02]">
                  <td className="py-2 pr-4 font-mono font-bold text-orange-400">#{z.number}</td>
                  <td className="py-2 pr-4 text-white max-w-xs truncate">{z.title}</td>
                  <td className="py-2 pr-4 text-noc-muted">{z.owner ?? '—'}</td>
                  <td className="py-2 pr-4 text-noc-muted">{z.group ?? '—'}</td>
                  <td className="py-2 text-right font-bold text-orange-400 tabular-nums">{z.days_idle}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
