import { useCallback, useState } from 'react'
import { getTodayAnalystLoad } from '../api/client'
import { usePolling } from '../hooks/usePolling'

const COLORS = [
  '#38bdf8', '#34d399', '#fb923c', '#a78bfa',
  '#f472b6', '#4ade80', '#fbbf24', '#818cf8', '#94a3b8',
]
const colorAt = (i) => COLORS[i % COLORS.length]

// YYYY-MM-DD para a data local atual
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function offsetDate(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatOwner(owner) {
  if (!owner) return '(sem nome)'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
}

function AnalystRow({ item, maxCount, color }) {
  const pct = maxCount > 0 ? (item.ticket_count / maxCount) * 100 : 0
  return (
    <li className="flex items-center gap-3">
      <span className="text-xs font-medium text-white w-24 shrink-0 truncate" title={item.owner}>
        {formatOwner(item.owner)}
      </span>
      <div className="flex-1 min-w-0 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums w-5 text-right shrink-0" style={{ color }}>
        {item.ticket_count}
      </span>
    </li>
  )
}

function Skeleton() {
  return (
    <div className="noc-card flex flex-col gap-3 animate-pulse">
      <div className="h-3 w-48 bg-noc-border rounded" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3 w-24 bg-noc-border rounded" />
          <div className="h-2 flex-1 bg-noc-border rounded-full" />
          <div className="h-3 w-5 bg-noc-border rounded" />
        </div>
      ))}
    </div>
  )
}

const TODAY    = todayISO()
const PRESETS  = [
  { label: 'Hoje',   value: TODAY },
  { label: 'Ontem',  value: offsetDate(-1) },
  { label: 'D-2',    value: offsetDate(-2) },
]

export default function AnalystLoadToday() {
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [customDate,   setCustomDate]   = useState('')

  const fetchFn = useCallback(
    () => getTodayAnalystLoad(selectedDate === TODAY ? null : selectedDate),
    [selectedDate],
  )
  const { data, loading, error } = usePolling(fetchFn, selectedDate === TODAY ? 15_000 : 0)

  // Só mostra skeleton na primeira carga — troca de data mantém conteúdo anterior visível
  if (loading && !data) return <Skeleton />

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const date  = data?.date  ?? '—'
  const max   = items.length > 0 ? items[0].ticket_count : 1
  const isHistory = selectedDate !== TODAY

  function applyCustom(e) {
    const v = e.target.value
    setCustomDate(v)
    if (v) setSelectedDate(v)
  }

  return (
    <div className={`noc-card flex flex-col gap-3 transition-opacity duration-150 ${loading ? 'opacity-60' : 'opacity-100'}`}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xs uppercase tracking-widest text-noc-muted">Carga por Analista</h2>
        <div className="flex items-center gap-2">
          {loading && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />}
          <span className="text-xs text-noc-muted tabular-nums">
            {total} {isHistory ? 'ticket' : 'ativo'}{total !== 1 ? 's' : ''} · {fmtDate(date)}
          </span>
        </div>
      </div>

      {/* Filtro de data */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => { setSelectedDate(p.value); setCustomDate('') }}
            className={`px-2 py-0.5 rounded text-xs transition-colors
              ${selectedDate === p.value
                ? 'bg-sky-500/20 text-sky-400'
                : 'text-noc-muted hover:text-white'}`}
          >
            {p.label}
          </button>
        ))}
        <input
          type="date"
          value={customDate}
          max={TODAY}
          onChange={applyCustom}
          className="ml-1 px-2 py-0.5 rounded text-xs bg-noc-surface border border-noc-border
            text-noc-muted focus:outline-none focus:border-sky-500 focus:text-white
            [color-scheme:dark] cursor-pointer"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400">
          {error?.response?.status === 404
            ? `Sem dados para ${fmtDate(selectedDate)} — dashboard não estava ativo nesse dia.`
            : '✗ Erro ao carregar — backend offline?'}
        </p>
      )}

      {!error && items.length === 0 && (
        <p className="text-sm text-noc-muted py-2 text-center">
          {isHistory
            ? `Nenhum chamado com analista em ${fmtDate(selectedDate)}.`
            : 'Nenhum chamado ativo hoje com analista atribuído.'}
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {items.map((item, i) => (
            <AnalystRow key={item.owner} item={item} maxCount={max} color={colorAt(i)} />
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <p className="text-[10px] text-noc-muted text-right mt-1">
          {isHistory
            ? `Total criado em ${fmtDate(date)} (todos os estados)`
            : 'Ativos criados hoje (excl. resolvidos/fechados)'}
        </p>
      )}
    </div>
  )
}
