import { useCallback } from 'react'
import { getTodayFeed } from '../api/client'
import { usePolling } from '../hooks/usePolling'

const STATE_PALETTE = {
  'aberto':               { text: 'text-sky-400',     bg: 'bg-sky-400/10',     label: 'Aberto'         },
  'em atendimento':       { text: 'text-yellow-400',  bg: 'bg-yellow-400/10',  label: 'Em Atendimento' },
  'escalonado dev':       { text: 'text-violet-400',  bg: 'bg-violet-400/10',  label: 'Escalonado DEV' },
  'aguardando cliente':   { text: 'text-orange-400',  bg: 'bg-orange-400/10',  label: 'Ag. Cliente'    },
  'aguardando terceiros': { text: 'text-amber-400',   bg: 'bg-amber-400/10',   label: 'Ag. Terceiros'  },
  'resolvido':            { text: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Resolvido'      },
  'closed':               { text: 'text-slate-400',   bg: 'bg-slate-400/10',   label: 'Fechado'        },
  'fechado':              { text: 'text-slate-400',   bg: 'bg-slate-400/10',   label: 'Fechado'        },
  'merged':               { text: 'text-slate-500',   bg: 'bg-slate-500/10',   label: 'Merged'         },
}
const FALLBACK = { text: 'text-noc-muted', bg: 'bg-noc-border', label: null }

function statePalette(state) {
  return state ? (STATE_PALETTE[state.toLowerCase()] ?? FALLBACK) : FALLBACK
}

function formatTime(iso) {
  if (!iso) return '—'
  // O backend envia UTC SEM timezone (ex: "2026-06-05T16:36:00").
  // Sem o marcador, o JS trata como hora local → adianta 3h.
  // Forçamos interpretação como UTC e exibimos no fuso de Brasília.
  let s = iso
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z'
  }
  return new Date(s).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })
}

function abbrevOwner(owner) {
  if (!owner) return '—'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  const parts = local.split(/[.\s_-]+/).filter(Boolean)
  if (!parts.length) return owner
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  return parts.length === 1 ? first : `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

function StateBadge({ state }) {
  const p = statePalette(state)
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold
      leading-none whitespace-nowrap ${p.text} ${p.bg}`}>
      {p.label ?? state}
    </span>
  )
}

function TicketRow({ ticket, even }) {
  const p = statePalette(ticket.state)
  return (
    <tr className={`border-b border-noc-border/50 hover:bg-white/[.03] transition-colors ${even ? 'bg-white/[.015]' : ''}`}>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        <span className={`font-mono text-xs font-bold ${p.text}`}>#{ticket.number}</span>
      </td>
      <td className="px-3 py-2 align-middle max-w-0 w-full">
        <p className="text-sm text-white truncate" title={ticket.title}>{ticket.title}</p>
        {ticket.group && <p className="text-[10px] text-noc-muted truncate mt-0.5">{ticket.group}</p>}
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        <StateBadge state={ticket.state} />
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        <span className="text-xs text-noc-muted">{abbrevOwner(ticket.owner)}</span>
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap text-right">
        <span className="text-xs text-noc-muted tabular-nums">{formatTime(ticket.created_at)}</span>
      </td>
    </tr>
  )
}

function Skeleton() {
  return (
    <div className="noc-card flex flex-col gap-3 animate-pulse">
      <div className="h-3 w-48 bg-noc-border rounded" />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-4 w-14 bg-noc-border rounded" />
          <div className="h-4 flex-1 bg-noc-border rounded" />
          <div className="h-4 w-20 bg-noc-border rounded" />
          <div className="h-4 w-16 bg-noc-border rounded" />
        </div>
      ))}
    </div>
  )
}

export default function TodayFeed() {
  const fetchFn = useCallback(getTodayFeed, [])
  const { data, loading, error } = usePolling(fetchFn, 15_000)

  if (loading && !data) return <Skeleton />

  const tickets = data?.tickets ?? []
  const count   = data?.count   ?? 0
  const date    = data?.date    ?? '—'

  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-noc-muted">Feed de Hoje</h2>
        <div className="flex items-center gap-2">
          {loading && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />}
          <span className="text-xs text-noc-muted tabular-nums">
            {count} chamado{count !== 1 ? 's' : ''} · {date}
          </span>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">✗ Erro ao carregar feed — backend offline?</p>}

      {!error && tickets.length === 0 && (
        <p className="text-sm text-noc-muted py-4 text-center">Nenhum chamado aberto hoje ainda.</p>
      )}

      {tickets.length > 0 && (
        <div className="overflow-auto max-h-[480px] rounded-md ring-1 ring-noc-border">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-noc-bg">
              <tr className="border-b border-noc-border">
                {['Ticket', 'Título', 'Status', 'Analista', 'Hora'].map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-noc-muted font-semibold whitespace-nowrap ${i === 4 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket, i) => (
                <TicketRow key={ticket.ticket_id} ticket={ticket} even={i % 2 === 0} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
