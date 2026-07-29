import { useCallback, useEffect, useRef, useState } from 'react'
import { getAnalystDayDetail, getAnalystLoad, getTopOffenderDetail, getTopOffenders } from '../api/client'
import { usePolling } from '../hooks/usePolling'

// ── Utilidades ────────────────────────────────────────────────────────────────

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

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Meses de startYM até o mês atual, mais recente primeiro */
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

function monthToDates(ym) {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return [`${ym}-01`, `${ym}-${String(lastDay).padStart(2, '0')}`]
}

function Label({ children }) {
  return <h2 className="text-xs uppercase tracking-widest text-noc-muted">{children}</h2>
}

const STATE_COLOR = {
  'em atendimento':       'text-sky-400',
  'escalonado dev':       'text-violet-400',
  'escalonado rotas':     'text-cyan-400',
  'escalonado infra':     'text-rose-400',
  'aguardando cliente':   'text-amber-400',
  'aguardando terceiros': 'text-orange-400',
  'resolvido':            'text-emerald-400',
  'fechado':              'text-noc-muted',
  'closed':               'text-noc-muted',
  'aberto':               'text-rose-400',
}
function stateColor(s) {
  return STATE_COLOR[s?.toLowerCase()] ?? 'text-white/60'
}

const PRIORITY_COLOR = {
  '1 muito baixo':  'text-noc-muted',
  '2 baixo':        'text-noc-muted',
  '3 normal':       'text-white/60',
  '4 alto':         'text-amber-400',
  '5 muito alto':   'text-rose-400',
  'baixo':          'text-noc-muted',
  'normal':         'text-white/60',
  'alto':           'text-amber-400',
  'muito alto':     'text-rose-400',
}
function priorityColor(p) {
  return PRIORITY_COLOR[p?.toLowerCase()] ?? 'text-white/60'
}

const COLORS = ['#38bdf8','#34d399','#fb923c','#a78bfa','#f472b6','#4ade80','#fbbf24','#818cf8','#94a3b8','#e879f9']

// ── Drilldown de tickets (componente reutilizável) ────────────────────────────

function TicketDrilldown({ fetchFn, labelFn }) {
  const { data, loading } = usePolling(fetchFn, 0)
  const tickets = data?.tickets ?? []

  if (loading) return <div className="h-8 bg-noc-border rounded animate-pulse mt-1" />
  if (!tickets.length) return <p className="text-xs text-noc-muted mt-1 ml-7">Nenhum ticket em aberto.</p>

  return (
    <ul className="mt-1 mb-2 ml-7 flex flex-col gap-0.5">
      {tickets.map((t) => (
        <li key={t.number} className="flex items-center gap-2 text-xs">
          <span className="text-noc-muted tabular-nums shrink-0">#{t.number}</span>
          <span className="text-white/80 truncate flex-1 min-w-0">{t.title}</span>
          {t.priority && (
            <span className={`shrink-0 ${priorityColor(t.priority)}`}>{t.priority}</span>
          )}
          {labelFn && t.owner && (
            <span className="text-noc-muted shrink-0 hidden md:inline">{fullName(t.owner)}</span>
          )}
          <span className={`shrink-0 ${stateColor(t.state)}`}>{t.state}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Top Ofensores ─────────────────────────────────────────────────────────────

/** Sub-componente de linha — tem seus próprios hooks (correto para Rules of Hooks) */
function OffenderRow({ item, rank, max, by, expanded, onToggle, startDate, endDate }) {
  const isOpen    = expanded === item.name
  const detailFn  = useCallback(
    () => getTopOffenderDetail(by, item.name, startDate, endDate),
    [by, item.name, startDate, endDate]
  )
  const showOwner = by === 'group'

  return (
    <li>
      <button
        onClick={() => onToggle(item.name)}
        className="w-full flex items-center gap-3 rounded px-1 py-1 hover:bg-white/5 transition-colors group text-left"
      >
        <span className="text-xs text-noc-muted w-4 tabular-nums shrink-0">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-white truncate">{item.name}</span>
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              <span className="text-xs font-bold text-sky-400 tabular-nums">{item.ticket_count}</span>
              <span className="text-noc-muted text-xs group-hover:text-white transition-colors">
                {isOpen ? '▾' : '▸'}
              </span>
            </div>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full"
              style={{ width: `${(item.ticket_count / max) * 100}%` }} />
          </div>
        </div>
      </button>

      {isOpen && <TicketDrilldown fetchFn={detailFn} labelFn={showOwner} />}
    </li>
  )
}

function TopOffendersCard() {
  const [by, setBy]             = useState('customer')
  const [expanded, setExpanded] = useState(null)
  const [month, setMonth]       = useState(currentMonthISO())

  const [startDate, endDate] = monthToDates(month)
  const fetchFn = useCallback(() => getTopOffenders(by, startDate, endDate), [by, startDate, endDate])
  const { data, loading } = usePolling(fetchFn, 5 * 60_000)
  const items = data?.items ?? []
  const max   = items[0]?.ticket_count ?? 1

  function switchBy(val) { setBy(val); setExpanded(null) }
  function toggle(name)  { setExpanded((p) => p === name ? null : name) }

  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label>Top Ofensores</Label>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex gap-1">
            {['customer', 'group'].map((opt) => (
              <button key={opt} onClick={() => switchBy(opt)}
                className={`px-2 py-0.5 rounded text-xs transition-colors
                  ${by === opt ? 'bg-sky-500/20 text-sky-400' : 'text-noc-muted hover:text-white'}`}>
                {opt === 'customer' ? 'Cliente' : 'Grupo'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {MONTHS.map((m) => (
              <button key={m} onClick={() => { setMonth(m); setExpanded(null) }}
                className={`px-2 py-0.5 rounded text-xs transition-colors
                  ${month === m ? 'bg-sky-500/20 text-sky-400' : 'text-noc-muted hover:text-white'}`}>
                {fmtMonth(m)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="h-32 bg-noc-border rounded animate-pulse" />}
      {!loading && items.length === 0 && (
        <p className="text-xs text-noc-muted">Nenhum dado no período.</p>
      )}

      <ul className={`flex flex-col gap-1 transition-opacity duration-150 ${loading ? 'opacity-60' : 'opacity-100'}`}>
        {items.map((item, i) => (
          <OffenderRow
            key={item.name}
            item={item}
            rank={i + 1}
            max={max}
            by={by}
            expanded={expanded}
            onToggle={toggle}
            startDate={startDate}
            endDate={endDate}
          />
        ))}
      </ul>
    </div>
  )
}

// ── Carga por Analista (Geral) ────────────────────────────────────────────────

const MONTHS = monthsFrom('2026-01')

function AnalystLoadCard() {
  const [month, setMonth] = useState(currentMonthISO())

  const fetchFn = useCallback(() => getAnalystLoad(null, null, month), [month])
  const { data, loading } = usePolling(fetchFn, 5 * 60_000)
  const items = data?.items ?? []
  const max   = items[0]?.ticket_count ?? 1

  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label>Carga por Analista (Geral)</Label>
        <div className="flex gap-1 flex-wrap justify-end">
          {MONTHS.map((m) => (
            <button key={m} onClick={() => setMonth(m)}
              className={`px-2 py-0.5 rounded text-xs transition-colors
                ${month === m ? 'bg-sky-500/20 text-sky-400' : 'text-noc-muted hover:text-white'}`}>
              {fmtMonth(m)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="h-40 bg-noc-border rounded animate-pulse" />}
      {!loading && items.length === 0 && (
        <p className="text-xs text-noc-muted">Sem dados para {fmtMonth(month)}.</p>
      )}

      <ul className={`flex flex-col gap-2 transition-opacity duration-150 ${loading ? 'opacity-60' : 'opacity-100'}`}>
        {items.map((item, i) => (
          <li key={item.owner} className="flex items-center gap-3">
            <span className="text-xs font-medium text-white w-28 shrink-0 truncate">
              {fullName(item.owner)}
            </span>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(item.ticket_count / max) * 100}%`,
                  backgroundColor: COLORS[i % COLORS.length],
                }} />
            </div>
            <span className="text-xs font-bold tabular-nums w-7 text-right shrink-0"
              style={{ color: COLORS[i % COLORS.length] }}>
              {item.ticket_count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Carga do Dia — com drilldown ──────────────────────────────────────────────

function AnalystDayLoadCard() {
  const [date, setDate]         = useState(todayISO())
  const [expanded, setExpanded] = useState(null)

  const TODAY = todayISO()

  const fetchFn = useCallback(() => getAnalystDayDetail(date), [date])
  const { data, loading } = usePolling(fetchFn, date === TODAY ? 60_000 : 0)

  const analysts = data?.analysts ?? []
  const total    = data?.total    ?? 0
  const max      = analysts[0]?.ticket_count ?? 1

  function toggleExpand(owner) {
    setExpanded((prev) => (prev === owner ? null : owner))
  }

  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Label>Carga do Dia</Label>
          {!loading && total > 0 && (
            <span className="text-xs text-noc-muted tabular-nums">{total} chamados ativos</span>
          )}
        </div>
        <input
          type="date"
          value={date}
          max={TODAY}
          onChange={(e) => { setDate(e.target.value); setExpanded(null) }}
          className="px-2 py-0.5 rounded text-xs bg-noc-surface border border-noc-border
            text-noc-muted focus:outline-none focus:border-sky-500 focus:text-white
            [color-scheme:dark] cursor-pointer"
        />
      </div>

      {loading && <div className="h-40 bg-noc-border rounded animate-pulse" />}
      {!loading && analysts.length === 0 && (
        <p className="text-xs text-noc-muted">Nenhum chamado ativo para essa data.</p>
      )}

      <ul className={`flex flex-col gap-0.5 transition-opacity duration-150 ${loading ? 'opacity-60' : 'opacity-100'}`}>
        {analysts.map((item, i) => {
          const isOpen = expanded === item.owner
          return (
            <li key={item.owner}>
              <button
                onClick={() => toggleExpand(item.owner)}
                className="w-full flex items-center gap-3 rounded px-2 py-1.5 hover:bg-white/5 transition-colors group text-left"
              >
                <span className="text-xs font-medium text-white w-28 shrink-0 truncate">
                  {fullName(item.owner)}
                </span>
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(item.ticket_count / max) * 100}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }} />
                </div>
                <span className="text-xs font-bold tabular-nums w-7 text-right shrink-0"
                  style={{ color: COLORS[i % COLORS.length] }}>
                  {item.ticket_count}
                </span>
                <span className="text-noc-muted text-xs w-3 shrink-0 group-hover:text-white transition-colors">
                  {isOpen ? '▾' : '▸'}
                </span>
              </button>

              {isOpen && (
                <ul className="ml-32 mt-1 mb-2 flex flex-col gap-0.5">
                  {item.tickets.map((t) => (
                    <li key={t.number} className="flex items-center gap-2 text-xs">
                      <span className="text-noc-muted tabular-nums shrink-0">#{t.number}</span>
                      <span className="text-white/80 truncate flex-1 min-w-0">{t.title}</span>
                      <span className={`shrink-0 ${stateColor(t.state)}`}>{t.state}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Situação Atual por Analista ───────────────────────────────────────────────

const STATE_COLS = [
  { key: 'em_atendimento',     label: 'Em Atend.',     color: 'text-sky-400'    },
  { key: 'escalonado_dev',     label: 'Escal. Dev',    color: 'text-violet-400' },
  { key: 'escalonado_rotas',   label: 'Escal. ROTAS',  color: 'text-cyan-400'   },
  { key: 'escalonado_infra',   label: 'Escal. INFRA',  color: 'text-rose-400'   },
  { key: 'ag_cliente',         label: 'Ag. Cliente',   color: 'text-amber-400'  },
  { key: 'ag_terceiros',       label: 'Ag. Terceiros', color: 'text-orange-400' },
]

function countByState(tickets) {
  const c = { em_atendimento: 0, escalonado_dev: 0, escalonado_rotas: 0, escalonado_infra: 0, ag_cliente: 0, ag_terceiros: 0 }
  for (const t of tickets) {
    const s = t.state?.toLowerCase().trim()
    if (s === 'em atendimento')            c.em_atendimento++
    else if (s === 'escalonado dev')       c.escalonado_dev++
    else if (s === 'escalonado rotas')     c.escalonado_rotas++
    else if (s === 'escalonado infra')     c.escalonado_infra++
    else if (s === 'aguardando cliente')   c.ag_cliente++
    else if (s === 'aguardando terceiros') c.ag_terceiros++
  }
  return c
}

function ActiveLoadCard() {
  const TODAY   = todayISO()
  const fetchFn = useCallback(() => getAnalystDayDetail(TODAY), [TODAY])
  const { data, loading } = usePolling(fetchFn, 60_000)

  const analysts = (data?.analysts ?? []).map((a) => ({
    ...a,
    counts: countByState(a.tickets),
  }))

  // totais por coluna
  const totals = STATE_COLS.reduce((acc, col) => {
    acc[col.key] = analysts.reduce((s, a) => s + a.counts[col.key], 0)
    return acc
  }, {})
  const grandTotal = analysts.reduce((s, a) => s + a.ticket_count, 0)

  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Situação Atual por Analista</Label>
        {!loading && grandTotal > 0 && (
          <span className="text-xs text-noc-muted tabular-nums">{grandTotal} chamados ativos</span>
        )}
      </div>

      {loading && <div className="h-28 bg-noc-border rounded animate-pulse" />}
      {!loading && analysts.length === 0 && (
        <p className="text-xs text-noc-muted">Nenhum chamado ativo no momento.</p>
      )}

      {!loading && analysts.length > 0 && (
        <div className={`overflow-x-auto transition-opacity duration-150 ${loading ? 'opacity-60' : 'opacity-100'}`}>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-noc-border">
                <th className="text-left py-1.5 pr-4 text-noc-muted font-medium">Analista</th>
                {STATE_COLS.map((col) => (
                  <th key={col.key} className={`text-center py-1.5 px-3 font-medium ${col.color}`}>
                    {col.label}
                  </th>
                ))}
                <th className="text-center py-1.5 pl-3 text-white font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {analysts.map((a, i) => (
                <tr key={a.owner}
                  className={`border-b border-noc-border/40 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                  <td className="py-1.5 pr-4 font-medium text-white whitespace-nowrap">
                    {fullName(a.owner)}
                  </td>
                  {STATE_COLS.map((col) => (
                    <td key={col.key} className="text-center py-1.5 px-3 tabular-nums">
                      {a.counts[col.key] > 0
                        ? <span className={`font-semibold ${col.color}`}>{a.counts[col.key]}</span>
                        : <span className="text-noc-border">—</span>}
                    </td>
                  ))}
                  <td className="text-center py-1.5 pl-3 tabular-nums font-bold text-white">
                    {a.ticket_count}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-noc-border">
                <td className="py-1.5 pr-4 text-noc-muted font-medium">Total</td>
                {STATE_COLS.map((col) => (
                  <td key={col.key} className={`text-center py-1.5 px-3 tabular-nums font-semibold ${col.color}`}>
                    {totals[col.key] || '—'}
                  </td>
                ))}
                <td className="text-center py-1.5 pl-3 tabular-nums font-bold text-sky-400">
                  {grandTotal}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Menu de exportação (busca os dados na hora do clique) ─────────────────────

function MetricsExportMenu() {
  const [open, setOpen]   = useState(false)
  const [busy, setBusy]   = useState(false)
  const [pmode, setPmode] = useState('month')        // 'month' | 'custom'
  const [month, setMonth] = useState(currentMonthISO())
  const [cStart, setCStart] = useState('')
  const [cEnd,   setCEnd]   = useState('')
  const ref = useRef(null)
  const TODAY = todayISO()

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pickMonth(m)    { setPmode('month'); setMonth(m) }
  function pickCustom(s,e) { setCStart(s); setCEnd(e); if (s && e) setPmode('custom') }

  async function run(fmt) {
    setBusy(true); setOpen(false)
    try {
      // Resolve período conforme o modo
      const isCustom = pmode === 'custom' && cStart && cEnd
      const start = isCustom ? cStart : monthToDates(month)[0]
      const end   = isCustom ? cEnd   : monthToDates(month)[1]
      const label = isCustom ? `${cStart}_a_${cEnd}` : fmtMonth(month)

      const [offC, offG, load] = await Promise.all([
        getTopOffenders('customer', start, end),
        getTopOffenders('group', start, end),
        // Carga por analista: usa start/end no modo custom, month no modo mês
        isCustom ? getAnalystLoad(start, end, null) : getAnalystLoad(null, null, month),
      ])
      const payload = {
        offCustomer: offC?.items ?? [],
        offGroup:    offG?.items ?? [],
        analystLoad: load?.items ?? [],
      }
      const { exportToExcel, exportToPDF } = await import('../utils/exportMetrics')
      if (fmt === 'xlsx') exportToExcel(payload, label)
      else exportToPDF(payload, label)
    } catch (err) {
      console.error('[export metrics]', err)
      alert('Não foi possível gerar o arquivo. Veja o console para detalhes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap justify-end" ref={ref}>
      {/* Botões de mês */}
      <div className="flex gap-1 flex-wrap justify-end">
        {MONTHS.map((m) => (
          <button key={m} onClick={() => pickMonth(m)}
            className={`px-2 py-0.5 rounded text-xs transition-colors
              ${pmode === 'month' && month === m ? 'bg-sky-500/20 text-sky-400' : 'text-noc-muted hover:text-white'}`}>
            {fmtMonth(m)}
          </button>
        ))}
      </div>

      <span className="text-noc-border text-xs hidden sm:inline">|</span>

      {/* Período personalizado */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-noc-muted shrink-0">De</span>
        <input type="date" value={cStart} max={cEnd || TODAY}
          onChange={e => pickCustom(e.target.value, cEnd)}
          className="px-2 py-0.5 rounded bg-noc-surface border border-noc-border text-noc-muted
            [color-scheme:dark] cursor-pointer focus:outline-none focus:text-white focus:border-sky-500 w-32" />
        <span className="text-noc-muted shrink-0">Até</span>
        <input type="date" value={cEnd} min={cStart} max={TODAY}
          onChange={e => pickCustom(cStart, e.target.value)}
          className="px-2 py-0.5 rounded bg-noc-surface border border-noc-border text-noc-muted
            [color-scheme:dark] cursor-pointer focus:outline-none focus:text-white focus:border-sky-500 w-32" />
        {pmode === 'custom' && <span className="text-sky-400 text-[10px] font-medium">● person.</span>}
      </div>

      {/* Botão exportar */}
      <div className="relative">
        <button onClick={() => setOpen(o => !o)} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs
            bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 border border-sky-500/30
            transition-all disabled:opacity-50 whitespace-nowrap">
          {busy ? '⏳ Gerando…' : '⬇ Exportar'}
          <span className="text-[9px]">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-noc-surface border border-noc-border
            rounded-lg shadow-xl py-1 min-w-[160px]">
            <button onClick={() => run('xlsx')}
              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-noc-border flex items-center gap-2">
              <span className="text-emerald-400">▦</span> Excel (.xlsx)
            </button>
            <button onClick={() => run('pdf')}
              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-noc-border flex items-center gap-2">
              <span className="text-rose-400">▤</span> PDF (.pdf)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function Metrics() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-sm font-bold text-white">Métricas Analíticas Mensais</h1>
        <MetricsExportMenu />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopOffendersCard />
        <AnalystLoadCard />
      </div>

      <ActiveLoadCard />

      <AnalystDayLoadCard />
    </div>
  )
}
