// ── Métricas Analíticas (REDESIGN — ligado ao backend real) ───────────────────
// Top Ofensores, Carga da Equipe e Situação Atual — dados reais via API.
import { useCallback, useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import {
  getTopOffenders, getTopOffenderDetail, getAnalystLoad,
  getTeamStatus, getAnalystTickets, getAnalystLoadTickets,
} from '../api/client'

// ── Paleta / tokens ───────────────────────────────────────────────────────────
const C = { good: '#34d399', warn: '#fbbf24', serious: '#fb923c', crit: '#f87171', accent: '#4f9cf9', violet: '#a78bfa' }
const INK = '#e8eef7', MUTED = '#8b97a8', FAINT = '#5b6675'
const SURFACE = '#131a26', BORDER = '#232d40', DEEP = '#0b0f17', ELEV = '#1a2233'
const FONT = "'Inter', system-ui, sans-serif"

// ── Helpers ───────────────────────────────────────────────────────────────────
function fullName(owner) {
  if (!owner || owner === '-') return owner ?? '?'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local.split(/[.\s_-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}
function currentMonthISO() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthsFrom(startYM = '2026-01') {
  const out = []; const [sy, sm] = startYM.split('-').map(Number)
  const now = new Date(); let y = now.getFullYear(), m = now.getMonth() + 1
  while (y > sy || (y === sy && m >= sm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (m === 0) { m = 12; y-- } }
  return out
}
function fmtMonth(ym) {
  const [y, m] = ym.split('-'); const n = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${n[+m - 1]}/${y.slice(2)}`
}
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate()
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, '0')}` }
}

const MONTHS = monthsFrom('2026-01')

// Colunas de estado da Situação Atual
const STATE_COLS = [
  { key: 'em_atend', label: 'Em Atend.', color: C.accent },
  { key: 'escal_dev', label: 'Escal. Dev', color: C.violet },
  { key: 'ag_cliente', label: 'Ag. Cliente', color: C.warn },
  { key: 'ag_terceiros', label: 'Ag. Terceiros', color: C.serious },
]
// ticket.state (rótulo do Zammad) → chave da coluna
function stateKey(s) {
  const l = (s || '').toLowerCase()
  if (l.includes('em atend')) return 'em_atend'
  if (l.includes('escalonado')) return 'escal_dev'
  if (l.includes('cliente')) return 'ag_cliente'
  if (l.includes('terceiro')) return 'ag_terceiros'
  return null
}
const TSTATE_COLOR = {
  'em atendimento': C.accent, 'aguardando cliente': C.warn, 'aguardando terceiros': C.serious,
  'escalonado dev': C.violet, 'escalonado rotas': C.accent, 'escalonado infra': C.crit,
  'resolvido': C.good, 'closed': MUTED, 'fechado': MUTED,
}
const tstateColor = s => TSTATE_COLOR[(s || '').toLowerCase()] ?? MUTED

// ── Leaderboard (clicável só quando recebe onItemClick) ───────────────────────
function Leaderboard({ items, valueLabel, onItemClick, loading }) {
  const max = items[0]?.value ?? 1
  const clickable = !!onItemClick
  if (loading) return <div className="flex flex-col gap-2 py-2">{[...Array(6)].map((_, i) => <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: `${BORDER}66` }} />)}</div>
  if (!items.length) return <p className="text-xs text-center py-8" style={{ color: FAINT }}>Sem dados no período.</p>
  return (
    <div className="flex flex-col">
      {items.map((it, i) => {
        const pct = Math.max(4, (it.value / max) * 100)
        const Tag = clickable ? 'button' : 'div'
        return (
          <Tag key={it.key ?? it.name} onClick={clickable ? () => onItemClick(it) : undefined}
            className={`relative flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left transition-colors group ${clickable ? 'hover:bg-[#1a2233]' : ''}`}
            style={{ borderBottom: i === items.length - 1 ? 'none' : `1px solid ${BORDER}55` }}>
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[70%] rounded-md pointer-events-none" style={{ width: `${pct}%`, background: 'rgba(79,156,249,0.06)' }} />
            <span className="relative text-[11px] tabular-nums w-5 text-center shrink-0" style={{ color: i < 3 ? INK : FAINT, fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</span>
            <span className="relative flex-1 min-w-0 truncate text-[12.5px]" style={{ color: INK }} title={it.name}>{it.name}</span>
            {clickable && <span className="relative text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: FAINT }}>ver ▸</span>}
            <span className="relative text-[15px] font-bold tabular-nums shrink-0" style={{ color: INK }}>{it.value}</span>
          </Tag>
        )
      })}
      {valueLabel && <p className="text-[10px] mt-2 text-right" style={{ color: FAINT }}>{valueLabel}</p>}
    </div>
  )
}

// ── Donut de distribuição por estado ──────────────────────────────────────────
function StateDonut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const R = 70, SW = 24, CIRC = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="flex items-center justify-center gap-8 flex-wrap py-2">
      <svg width="176" height="176" viewBox="0 0 176 176" className="shrink-0">
        <g transform="translate(88,88) rotate(-90)">
          <circle r={R} fill="none" stroke={BORDER} strokeWidth={SW} opacity="0.4" />
          {data.map(d => {
            const len = total ? (d.value / total) * CIRC : 0
            const seg = <circle key={d.label} r={R} fill="none" stroke={d.color} strokeWidth={SW} strokeDasharray={`${len} ${CIRC - len}`} strokeDashoffset={-acc} />
            acc += len; return seg
          })}
        </g>
        <text x="88" y="82" textAnchor="middle" fontSize="30" fontWeight="700" fill={INK}>{total}</text>
        <text x="88" y="102" textAnchor="middle" fontSize="10.5" fill={FAINT}>chamados ativos</text>
      </svg>
      <div className="flex flex-col gap-2.5 min-w-[200px]">
        {data.map(d => (
          <div key={d.label} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-[13px] flex-1" style={{ color: INK }}>{d.label}</span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: d.color }}>{d.value}</span>
            <span className="text-[11px] tabular-nums w-9 text-right" style={{ color: FAINT }}>{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Panel({ title, right, children, className = '' }) {
  return (
    <div className={`rounded-[13px] p-[18px] flex flex-col ${className}`} style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-[10.5px] uppercase tracking-[1.4px] font-semibold" style={{ color: FAINT }}>{title}</p>
        {right}
      </div>
      {children}
    </div>
  )
}

// ── Tabela Situação Atual ─────────────────────────────────────────────────────
function StatusPill({ value, color }) {
  if (!value) return <span className="text-[13px]" style={{ color: FAINT }}>—</span>
  return <span className="inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-md text-[12.5px] font-semibold tabular-nums" style={{ color, background: `${color}1f` }}>{value}</span>
}
function TeamStatusTable({ rows, onRowClick, loading }) {
  if (loading) return <div className="h-40 rounded-lg animate-pulse" style={{ background: `${BORDER}66` }} />
  if (!rows.length) return <p className="text-xs text-center py-8" style={{ color: FAINT }}>Sem tickets ativos no momento.</p>
  const totals = STATE_COLS.reduce((acc, c) => ({ ...acc, [c.key]: rows.reduce((s, r) => s + r[c.key], 0) }), {})
  const grand = rows.reduce((s, r) => s + r.total, 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
            <th className="py-2 pr-4 text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: FAINT }}>Analista</th>
            {STATE_COLS.map(c => <th key={c.key} className="py-2 px-3 text-center text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: c.color }}>{c.label}</th>)}
            <th className="py-2 pl-3 text-center text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: INK }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.owner} onClick={() => onRowClick(r)} className="cursor-pointer transition-colors hover:bg-[#1a2233]" style={{ borderBottom: `1px solid ${BORDER}55` }}>
              <td className="py-2.5 pr-4 text-[13px] font-medium whitespace-nowrap" style={{ color: INK }}>{r.name}</td>
              {STATE_COLS.map(c => <td key={c.key} className="py-2.5 px-3 text-center"><StatusPill value={r[c.key]} color={c.color} /></td>)}
              <td className="py-2.5 pl-3 text-center text-[14px] font-bold tabular-nums" style={{ color: INK }}>{r.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `1px solid ${BORDER}` }}>
            <td className="py-2.5 pr-4 text-[11px]" style={{ color: FAINT }}>Total</td>
            {STATE_COLS.map(c => <td key={c.key} className="py-2.5 px-3 text-center text-[12.5px] font-semibold tabular-nums" style={{ color: c.color }}>{totals[c.key] || '—'}</td>)}
            <td className="py-2.5 pl-3 text-center text-[13px] font-bold tabular-nums" style={{ color: C.accent }}>{grand}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── TicketsDrawer (analista OU ofensor) — busca real ──────────────────────────
function TicketsDrawer({ ctx, month, onClose }) {
  const isOff = ctx.type === 'offender'
  const isPeriod = ctx.type === 'analyst_period'
  const fetchFn = useCallback(() => {
    if (isOff) { const { start, end } = monthRange(month); return getTopOffenderDetail(ctx.by, ctx.name, start, end) }
    if (isPeriod) return getAnalystLoadTickets(ctx.owner, month)
    return getAnalystTickets(ctx.owner)
  }, [ctx, month, isOff, isPeriod])
  const { data, loading } = usePolling(fetchFn, 0)

  const [q, setQ] = useState('')
  const [stateSel, setStateSel] = useState(null)
  const all = data?.tickets ?? []

  const counts = {}
  all.forEach(t => { const k = stateKey(t.state); if (k) counts[k] = (counts[k] || 0) + 1 })

  const term = q.trim().toLowerCase()
  const tickets = all.filter(t =>
    (!stateSel || stateKey(t.state) === stateSel) &&
    (!term || String(t.number).includes(term) || (t.title || '').toLowerCase().includes(term) || fullName(t.owner).toLowerCase().includes(term))
  )

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg z-50 flex flex-col shadow-2xl" style={{ background: SURFACE, borderLeft: `1px solid ${BORDER}`, fontFamily: FONT, animation: 'noc-slide .22s ease-out' }}>
        <style>{`@keyframes noc-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        <div className="flex items-start justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="min-w-0">
            <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.accent }}>{isOff ? (ctx.by === 'group' ? 'Grupo' : 'Ofensor') : isPeriod ? 'Analista · atendidos no período' : 'Analista'}</span>
            <p className="text-base font-bold mt-0.5 truncate" style={{ color: INK }} title={ctx.name}>{ctx.name}</p>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>
              {loading ? 'carregando…' : <><span className="font-bold tabular-nums">{tickets.length}</span>{(term || stateSel) ? ` de ${all.length}` : ''} chamados</>}
            </p>
          </div>
          <button onClick={onClose} className="text-xl leading-none shrink-0" style={{ color: MUTED }}>✕</button>
        </div>

        {!loading && all.length > 0 && (
          <div className="px-5 py-3 shrink-0 flex gap-2 flex-wrap items-center" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <button onClick={() => setStateSel(null)} className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all"
              style={stateSel === null ? { color: INK, background: ELEV, border: `1px solid ${BORDER}` } : { color: MUTED, border: `1px solid ${BORDER}` }}>Todos ({all.length})</button>
            {STATE_COLS.map(c => counts[c.key] > 0 && (
              <button key={c.key} onClick={() => setStateSel(stateSel === c.key ? null : c.key)} className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all"
                style={stateSel === c.key ? { color: c.color, background: `${c.color}2e`, border: `1px solid ${c.color}` } : { color: c.color, background: `${c.color}14`, border: `1px solid transparent` }}>
                {c.label}: {counts[c.key]}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 pt-3 pb-1 shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: FAINT }}>🔍</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por nº, título ou analista…"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-[12px] outline-none" style={{ background: DEEP, border: `1px solid ${BORDER}`, color: INK }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-1 flex flex-col gap-0.5">
          {loading && <div className="h-8 rounded animate-pulse mt-2" style={{ background: `${BORDER}66` }} />}
          {!loading && tickets.length === 0 && <p className="text-xs text-center py-8" style={{ color: FAINT }}>Nenhum chamado para este filtro.</p>}
          {tickets.map(t => (
            <div key={t.number} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}55` }}>
              <span className="text-[11px] tabular-nums shrink-0 mt-0.5 w-[52px]" style={{ color: FAINT }}>#{t.number}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug" style={{ color: INK }}>{t.title}</p>
                {isOff && t.owner && <p className="text-[11px] mt-1" style={{ color: MUTED }}>🔧 {fullName(t.owner)}</p>}
              </div>
              <span className="text-[10.5px] font-medium shrink-0 mt-0.5 whitespace-nowrap px-1.5 py-0.5 rounded" style={{ color: tstateColor(t.state), background: `${tstateColor(t.state)}18` }}>{t.state}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function MetricsNew() {
  const [month, setMonth] = useState(currentMonthISO())
  const [offBy, setOffBy] = useState('customer')
  const [drawer, setDrawer] = useState(null)

  const { start, end } = monthRange(month)

  const offFn = useCallback(() => getTopOffenders(offBy, start, end), [offBy, start, end])
  const loadFn = useCallback(() => getAnalystLoad(null, null, month), [month])
  const statusFn = useCallback(() => getTeamStatus(), [])

  const { data: offData, loading: offLoad } = usePolling(offFn, 5 * 60_000)
  const { data: loadData, loading: loadLoad } = usePolling(loadFn, 5 * 60_000)
  const { data: statusData, loading: statusLoad } = usePolling(statusFn, 30_000)

  const offItems = (offData?.items ?? []).map(o => ({ name: o.name, value: o.ticket_count }))
  const loadItems = (loadData?.items ?? []).map(o => ({ name: fullName(o.owner), owner: o.owner, value: o.ticket_count }))
  const loadTotal = loadItems.reduce((s, x) => s + x.value, 0)

  const statusRows = (statusData?.analysts ?? []).map(a => ({
    owner: a.owner, name: a.name ?? fullName(a.owner),
    em_atend: a.em_atend, escal_dev: a.escal_dev, ag_cliente: a.ag_cliente, ag_terceiros: a.ag_terceiros, total: a.total,
  }))
  const donutData = STATE_COLS.map(c => ({ label: c.label, color: c.color, value: statusRows.reduce((s, r) => s + r[c.key], 0) }))

  return (
    <div style={{ fontFamily: FONT, color: INK }} className="flex flex-col gap-5 min-h-full">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-[16px] font-bold">Métricas Analíticas</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-0.5 p-[3px] rounded-[9px] flex-wrap" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            {MONTHS.map(m => (
              <button key={m} onClick={() => setMonth(m)} className="text-[11px] px-2.5 py-1.5 rounded-md transition-colors"
                style={month === m ? { background: ELEV, color: INK } : { color: MUTED }}>{fmtMonth(m)}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Linha 1 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Top Ofensores"
          right={
            <div className="flex gap-0.5 p-[2px] rounded-lg" style={{ background: DEEP, border: `1px solid ${BORDER}` }}>
              {[['customer', 'Cliente'], ['group', 'Grupo']].map(([v, l]) => (
                <button key={v} onClick={() => setOffBy(v)} className="text-[11px] px-2.5 py-1 rounded-md transition-colors"
                  style={offBy === v ? { background: ELEV, color: C.accent } : { color: MUTED }}>{l}</button>
              ))}
            </div>
          }>
          <Leaderboard items={offItems} loading={offLoad} valueLabel={`chamados no período · ${fmtMonth(month)}`}
            onItemClick={(it) => setDrawer({ type: 'offender', by: offBy, name: it.name })} />
        </Panel>

        <Panel title="Carga da Equipe Mensal">
          <Leaderboard items={loadItems} loading={loadLoad} valueLabel={`${loadTotal} chamados atendidos · ${fmtMonth(month)}`}
            onItemClick={(it) => setDrawer({ type: 'analyst_period', owner: it.owner, name: it.name })} />
        </Panel>
      </section>

      {/* Linha 2 */}
      <section className="flex-1 min-h-0">
        <Panel title="Situação Atual da Equipe"
          right={<span className="text-[10px] normal-case tracking-normal" style={{ color: FAINT }}>ao vivo · clique numa linha para ver os chamados</span>}
          className="h-full">
          <TeamStatusTable rows={statusRows} loading={statusLoad} onRowClick={(r) => setDrawer({ type: 'analyst', owner: r.owner, name: r.name })} />
          <p className="text-[10px] mt-3" style={{ color: FAINT }}>
            Zero = <span style={{ color: FAINT }}>—</span> · valores &gt; 0 em pílula colorida por estado · no drawer, clique nas pílulas para filtrar
          </p>
        </Panel>
      </section>

      {/* Linha 3 — distribuição por estado */}
      <section>
        <Panel title="Distribuição por Estado"
          right={<span className="text-[10px] normal-case tracking-normal" style={{ color: FAINT }}>momento atual · toda a equipe</span>}>
          <StateDonut data={donutData} />
        </Panel>
      </section>

      {drawer && <TicketsDrawer ctx={drawer} month={month} onClose={() => setDrawer(null)} />}
    </div>
  )
}
