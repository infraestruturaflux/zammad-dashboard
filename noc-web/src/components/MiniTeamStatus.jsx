import { useCallback } from 'react'
import { getTeamNow } from '../api/client'
import { usePolling } from '../hooks/usePolling'

/** "joao.bortolaci@flux.net.br" → "Joao Bortolaci" */
function fullName(owner) {
  if (!owner) return '?'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
}

const BADGE_COLORS = [
  'bg-sky-500/20 text-sky-300 ring-sky-500/30',
  'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
  'bg-violet-500/20 text-violet-300 ring-violet-500/30',
  'bg-orange-500/20 text-orange-300 ring-orange-500/30',
  'bg-pink-500/20 text-pink-300 ring-pink-500/30',
  'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  'bg-cyan-500/20 text-cyan-300 ring-cyan-500/30',
  'bg-rose-500/20 text-rose-300 ring-rose-500/30',
]

export default function MiniTeamStatus() {
  const fetchFn = useCallback(getTeamNow, [])
  const { data, loading } = usePolling(fetchFn, 20_000)

  const members      = data?.members       ?? []
  const totalTickets = data?.total_tickets ?? 0

  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-noc-muted">Equipe Ativa no Momento</h2>
        {!loading && members.length > 0 && (
          <span className="text-xs text-noc-muted tabular-nums">
            {totalTickets} em atendimento
          </span>
        )}
      </div>

      {loading && !members.length && (
        <div className="flex flex-wrap gap-2 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-28 bg-noc-border rounded-full" />
          ))}
        </div>
      )}

      {!loading && !members.length && (
        <p className="text-xs text-noc-muted">Nenhum analista com chamado em atendimento agora.</p>
      )}

      <div className={`flex flex-wrap gap-2 transition-opacity duration-150 ${loading ? 'opacity-60' : 'opacity-100'}`}>
        {members.map((m, i) => (
          <div
            key={m.owner}
            title={m.owner}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full ring-1
              ${BADGE_COLORS[i % BADGE_COLORS.length]}`}
          >
            <span className="text-sm font-semibold leading-none">{fullName(m.owner)}</span>
            <span className="text-xs font-bold tabular-nums bg-black/20 rounded-full px-1.5 py-0.5 leading-none">
              {m.active_count}
            </span>
          </div>
        ))}
      </div>

      {members.length > 0 && (
        <p className="text-[10px] text-noc-muted/70 leading-tight">
          Os números representam chamados em atendimento por analista no momento.
        </p>
      )}
    </div>
  )
}
