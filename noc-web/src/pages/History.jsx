import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { getAnalystLoad, getDailyVolume } from '../api/client'
import { usePolling } from '../hooks/usePolling'

// ── Utilidades ────────────────────────────────────────────────────────────────

function currentMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthsFrom(startYM = '2026-01') {
  const result = []
  const [sy, sm] = startYM.split('-').map(Number)
  const now = new Date()
  let y = now.getFullYear(), m = now.getMonth() + 1
  while (y > sy || (y === sy && m >= sm)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m--
    if (m === 0) { m = 12; y-- }
  }
  return result
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y}`
}

/** "joao.bortolaci@flux.net.br" → "Joao Bortolaci" */
function fullName(owner) {
  if (!owner || owner === '-') return owner ?? '?'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
}

function Label({ children }) {
  return <h2 className="text-xs uppercase tracking-widest text-noc-muted">{children}</h2>
}

// ── Tooltip escuro compartilhado ──────────────────────────────────────────────

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-noc-surface border border-noc-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-noc-muted mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold tabular-nums text-white">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Seletor de mês reutilizável ───────────────────────────────────────────────

function MonthPicker({ value, onChange }) {
  // Recalcula a cada render para incluir meses futuros automaticamente
  const months = monthsFrom('2026-01')
  return (
    <div className="flex gap-1 flex-wrap justify-end">
      {months.map((m) => (
        <button key={m} onClick={() => onChange(m)}
          className={`px-2 py-0.5 rounded text-xs transition-colors
            ${value === m ? 'bg-sky-500/20 text-sky-400' : 'text-noc-muted hover:text-white'}`}>
          {fmtMonth(m)}
        </button>
      ))}
    </div>
  )
}

// ── Card 1: Evolução Diária (geral) ──────────────────────────────────────────

const ALL_LINES = [
  { key: 'criados',        color: '#38bdf8', label: 'Criados'        },
  { key: 'resolvidos',     color: '#34d399', label: 'Resolvidos'     },
  { key: 'fechados',       color: '#94a3b8', label: 'Fechados'       },
  { key: 'em_atendimento', color: '#a78bfa', label: 'Em Atendimento' },
  { key: 'ag_cliente',     color: '#f472b6', label: 'Ag. Cliente'    },
  { key: 'ag_terceiros',   color: '#fb923c', label: 'Ag. Terceiros'  },
]

function isWeekend(diaISO) {
  if (!diaISO) return false
  const dow = new Date(diaISO + 'T12:00:00').getDay() // 0=Dom, 6=Sáb
  return dow === 0 || dow === 6
}

// Linhas que dependem de snapshot diário (só existem a partir de ~mai/2026)
const SNAP_DEPENDENT_KEYS = new Set(['em_atendimento', 'ag_cliente', 'ag_terceiros'])

function DailyVolumeCard() {
  const [month, setMonth] = useState(currentMonthISO())

  const fetchFn = useCallback(() => getDailyVolume(month, null), [month])
  const { data, loading } = usePolling(fetchFn, 5 * 60_000)
  const points = (data?.points ?? []).filter((p) => !isWeekend(p.dia))

  // has_snap=false → mês sem nenhum snapshot (ex: abr/2026) → ocultar linhas de estado
  // has_snap=true  → pode ter snapshots parciais; nulls formam gaps naturais no gráfico
  const hasSnap = data?.has_snap ?? true
  const visibleLines = hasSnap
    ? ALL_LINES
    : ALL_LINES.filter((l) => !SNAP_DEPENDENT_KEYS.has(l.key))

  const totals = points.reduce(
    (acc, p) => ({ criados: acc.criados + p.criados, resolvidos: acc.resolvidos + p.resolvidos, fechados: acc.fechados + p.fechados }),
    { criados: 0, resolvidos: 0, fechados: 0 }
  )

  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Label>Evolução Diária</Label>
          {!loading && points.length > 0 && (
            <div className="flex gap-3 text-xs tabular-nums">
              <span className="text-sky-400">{totals.criados} criados</span>
              <span className="text-emerald-400">{totals.resolvidos} resolvidos</span>
              <span className="text-slate-400">{totals.fechados} fechados</span>
            </div>
          )}
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {loading && <div className="h-64 bg-noc-border rounded animate-pulse" />}
      {!loading && !points.length && (
        <p className="text-noc-muted text-sm text-center py-12">Nenhum dado para {fmtMonth(month)}.</p>
      )}
      {points.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={points} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3042" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
            {visibleLines.map((l) => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label}
                stroke={l.color} strokeWidth={2} dot={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {points.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-1">
          <p className="text-xs text-noc-muted leading-tight">
            {!hasSnap && (
              <span className="text-amber-400/70">⚠ Em Atend. / Ag. Cliente / Ag. Terceiros indisponíveis — mês sem snapshots diários.</span>
            )}
          </p>
          <p className="text-xs text-noc-muted text-right leading-tight">
            📅 Exibindo apenas dias úteis (seg–sex) · volume semanal de {fmtMonth(month)}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Card 2: Atividade por Analista ───────────────────────────────────────────

const LINES_ANALYST = [
  { key: 'trabalhados', color: '#fbbf24', label: 'Atendidos no Dia' },
  { key: 'resolvidos',  color: '#34d399', label: 'Resolvidos'       },
]

const EXCLUDED_ANALYST_NAMES = new Set(['Gabriel Maciel', 'Joao Guimaraes', 'Allan Martins'])

function AnalystHistoryCard() {
  const [month, setMonth]       = useState(currentMonthISO())
  const [owner, setOwner]       = useState(null)
  const [dropOpen, setDropOpen] = useState(false)
  const [search, setSearch]     = useState('')
  const dropRef                 = useRef(null)
  const searchRef               = useRef(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Carrega lista de analistas (sem filtro de data)
  const analystsFn = useCallback(() => getAnalystLoad(null, null, null), [])
  const { data: loadData } = usePolling(analystsFn, 10 * 60_000)
  const analysts = (loadData?.items ?? [])
    .filter((a) => a.owner && a.owner !== '-')
    .filter((a) => !EXCLUDED_ANALYST_NAMES.has(fullName(a.owner)))
    .sort((a, b) => fullName(a.owner).localeCompare(fullName(b.owner), 'pt'))

  const filteredAnalysts = search.trim()
    ? analysts.filter((a) => fullName(a.owner).toLowerCase().includes(search.toLowerCase()))
    : analysts

  // Seleciona o primeiro analista automaticamente quando a lista carrega
  const selectedOwner = owner ?? analysts[0]?.owner ?? null

  const fetchFn = useCallback(
    () => (selectedOwner ? getDailyVolume(month, selectedOwner) : Promise.resolve(null)),
    [month, selectedOwner]
  )
  const { data, loading } = usePolling(fetchFn, 5 * 60_000)
  const points = (data?.points ?? []).filter((p) => !isWeekend(p.dia))

  const totals = points.reduce(
    (acc, p) => ({ trabalhados: acc.trabalhados + (p.trabalhados ?? 0), resolvidos: acc.resolvidos + (p.resolvidos ?? 0) }),
    { trabalhados: 0, resolvidos: 0 }
  )

  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Label>Atividade por Analista</Label>

          {/* Combobox de seleção de analista com busca */}
          <div className="relative" ref={dropRef}>
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs bg-noc-border text-white min-w-[160px] cursor-pointer"
              onClick={() => { setDropOpen(true); setTimeout(() => searchRef.current?.focus(), 10) }}
            >
              {dropOpen ? (
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={selectedOwner ? fullName(selectedOwner) : 'Digite o nome...'}
                  className="bg-transparent outline-none flex-1 text-white placeholder:text-noc-muted min-w-0"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate">
                  {selectedOwner ? fullName(selectedOwner) : 'Selecione...'}
                </span>
              )}
              <span className="text-noc-muted shrink-0">{dropOpen ? '▴' : '▾'}</span>
            </div>
            {dropOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-noc-surface border border-noc-border rounded-lg shadow-xl py-1 min-w-[180px] max-h-64 overflow-y-auto">
                {filteredAnalysts.length === 0 && (
                  <p className="text-xs text-noc-muted px-3 py-2">Nenhum analista encontrado.</p>
                )}
                {filteredAnalysts.map((a) => (
                  <button key={a.owner}
                    onClick={() => { setOwner(a.owner); setDropOpen(false); setSearch('') }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                      ${selectedOwner === a.owner
                        ? 'text-violet-400 bg-violet-500/10'
                        : 'text-white hover:bg-noc-border'}`}>
                    {fullName(a.owner)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!loading && points.length > 0 && (
            <div className="flex gap-3 text-xs tabular-nums">
              <span className="text-amber-400">{totals.trabalhados} atendidos</span>
              <span className="text-emerald-400">{totals.resolvidos} resolvidos</span>
            </div>
          )}
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {!selectedOwner && (
        <p className="text-noc-muted text-sm text-center py-8">Selecione um analista acima.</p>
      )}

      {selectedOwner && loading && <div className="h-64 bg-noc-border rounded animate-pulse" />}

      {selectedOwner && !loading && !points.length && (
        <p className="text-noc-muted text-sm text-center py-8">
          Nenhuma atividade para {fullName(selectedOwner)} em {fmtMonth(month)}.
        </p>
      )}

      {selectedOwner && !loading && points.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3042" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
            {LINES_ANALYST.map((l) => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label}
                stroke={l.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {selectedOwner && !loading && points.length > 0 && (
        <p className="text-xs text-noc-muted text-right leading-tight">
          📅 Apenas dias úteis (seg–sex) · resoluções automáticas de fim de semana excluídas
        </p>
      )}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function History() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-sm font-bold text-white">Histórico da Fila</h1>
      <DailyVolumeCard />
      <AnalystHistoryCard />
    </div>
  )
}
