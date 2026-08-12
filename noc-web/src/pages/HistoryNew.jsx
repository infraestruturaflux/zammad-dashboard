// ── Histórico Operacional (REDESIGN — ligado ao backend real) ─────────────────
// Fluxo diário (criados vs resolvidos), Evolução do Backlog e Produtividade por
// analista — dados reais via daily-volume. Anomalia calculada no cliente.
import { useCallback, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, Legend, LabelList,
} from 'recharts'
import { usePolling } from '../hooks/usePolling'
import { getDailyVolume, getAnalystLoad, getDayTickets } from '../api/client'

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = { good: '#34d399', warn: '#fbbf24', serious: '#fb923c', crit: '#f87171', accent: '#4f9cf9', violet: '#a78bfa' }
const INK = '#e8eef7', MUTED = '#8b97a8', FAINT = '#5b6675'
const SURFACE = '#131a26', BORDER = '#232d40', DEEP = '#0b0f17', ELEV = '#1a2233'
const FONT = "'Inter', system-ui, sans-serif"

// ── Helpers ───────────────────────────────────────────────────────────────────
function fullName(owner) {
  if (!owner || owner === '-') return owner ?? '?'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local.split(/[.\s_-]+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}
function currentMonthISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthsFrom(startYM = '2026-01') {
  const out = []; const [sy, sm] = startYM.split('-').map(Number)
  const now = new Date(); let y = now.getFullYear(), m = now.getMonth() + 1
  while (y > sy || (y === sy && m >= sm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (m === 0) { m = 12; y-- } }
  return out
}
function fmtMonth(ym) { const [y, m] = ym.split('-'); const n = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']; return `${n[+m - 1]}/${y.slice(2)}` }
const MONTHS = monthsFrom('2026-01')

// Anomalia: pico acima de 130% da média móvel (7d anteriores)
function withAnomaly(points) {
  const cri = points.map(p => p.criados ?? 0)
  return points.map((p, i) => {
    const win = cri.slice(Math.max(0, i - 7), i)
    const mean = win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null
    let anomaly = null
    if (mean && mean > 0 && (p.criados ?? 0) > mean * 1.3) {
      const delta = Math.round(((p.criados / mean) - 1) * 100)
      anomaly = { delta, message: `Pico Anômalo: +${delta}% acima da média móvel (7d)` }
    }
    return { ...p, label: p.date, anomaly }
  })
}

// ── KPI ───────────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, arrow, tone }) {
  const color = tone === undefined ? INK : tone
  return (
    <div className="rounded-[13px] p-[18px] flex flex-col gap-1" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      <p className="text-[10.5px] uppercase tracking-[1.3px] font-semibold" style={{ color: FAINT }}>{label}</p>
      <span className="text-[26px] font-bold leading-none tabular-nums" style={{ color }}>{arrow ? arrow + ' ' : ''}{value}</span>
      {sub && <p className="text-[11px]" style={{ color: MUTED }}>{sub}</p>}
    </div>
  )
}
function Panel({ title, right, children }) {
  return (
    <div className="rounded-[13px] p-[18px] flex flex-col" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-2">
        <p className="text-[10.5px] uppercase tracking-[1.4px] font-semibold" style={{ color: FAINT }}>{title}</p>
        {right}
      </div>
      {children}
    </div>
  )
}

const NAMES = { criados: 'Criados', resolvidos: 'Resolvidos', backlog: 'Backlog acumulado', trabalhados: 'Trabalhados' }
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  return (
    <div style={{ background: ELEV, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontFamily: FONT, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
      <p style={{ color: INK, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: 1.7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: p.color || p.stroke || p.fill }} />
          <span style={{ color: MUTED, flex: 1 }}>{NAMES[p.dataKey] ?? p.name}</span>
          <span style={{ color: INK, fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
      {row?.anomaly && <p style={{ color: C.crit, fontSize: 11, marginTop: 7, paddingTop: 7, borderTop: `1px solid ${BORDER}`, maxWidth: 200, fontWeight: 600 }}>⚠ {row.anomaly.message}</p>}
    </div>
  )
}
const axisProps = { tick: { fill: MUTED, fontSize: 10.5 }, tickLine: false, axisLine: { stroke: BORDER } }
const legendStyle = { fontSize: 11.5, paddingTop: 6 }

// ── Drawer do dia (tickets criados na data) ───────────────────────────────────
function DayDrawer({ dia, label, onClose }) {
  const fetchFn = useCallback(() => getDayTickets(dia), [dia])
  const { data, loading } = usePolling(fetchFn, 0)
  const groups = data?.groups ?? []
  const tickets = data?.tickets ?? []
  const maxG = groups[0]?.count ?? 1
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 flex flex-col shadow-2xl" style={{ background: SURFACE, borderLeft: `1px solid ${BORDER}`, fontFamily: FONT, animation: 'noc-slide .22s ease-out' }}>
        <style>{`@keyframes noc-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
        <div className="flex items-start justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.accent }}>Chamados criados no dia</span>
            <p className="text-base font-bold mt-0.5" style={{ color: INK }}>{label}</p>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>{loading ? '…' : <><b style={{ color: INK }}>{data?.total ?? 0}</b> chamados</>}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none shrink-0" style={{ color: MUTED }}>✕</button>
        </div>

        {groups.length > 0 && (
          <div className="px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: FAINT }}>Top grupos do dia</p>
            <div className="flex flex-col gap-2">
              {groups.slice(0, 5).map((g, i) => (
                <div key={g.group} className="flex items-center gap-3">
                  <span className="text-[11px] tabular-nums w-4 text-center shrink-0" style={{ color: i === 0 ? C.accent : FAINT }}>{i + 1}</span>
                  <span className="text-[12.5px] flex-1 truncate" style={{ color: INK }}>{g.group}</span>
                  <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: BORDER }}><div className="h-full rounded-full" style={{ width: `${(g.count / maxG) * 100}%`, background: C.accent }} /></div>
                  <span className="text-[13px] font-bold tabular-nums w-6 text-right shrink-0" style={{ color: INK }}>{g.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-1 flex flex-col">
          {loading && <div className="h-8 rounded animate-pulse mt-2" style={{ background: `${BORDER}66` }} />}
          {!loading && tickets.length === 0 && <p className="text-xs text-center py-8" style={{ color: FAINT }}>Nenhum chamado criado neste dia.</p>}
          {tickets.map(t => (
            <div key={t.number} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}55` }}>
              <span className="text-[11px] tabular-nums shrink-0 mt-0.5 w-[52px]" style={{ color: FAINT }}>#{t.number}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug" style={{ color: INK }}>{t.title}</p>
                <p className="text-[11px] mt-1" style={{ color: MUTED }}>{t.group}{t.owner ? ` · 🔧 ${fullName(t.owner)}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function HistoryNew() {
  const [month, setMonth] = useState(currentMonthISO())
  const [analyst, setAnalyst] = useState(null)     // { owner, name } | null
  const [selOpen, setSelOpen] = useState(false)
  const [dayDrawer, setDayDrawer] = useState(null)

  const dailyFn = useCallback(() => getDailyVolume(month), [month])
  const loadFn = useCallback(() => getAnalystLoad(null, null, month), [month])
  const { data: daily, loading: dailyLoad } = usePolling(dailyFn, 5 * 60_000)
  const { data: load } = usePolling(loadFn, 5 * 60_000)

  const analysts = useMemo(() => (load?.items ?? []).map(a => ({ owner: a.owner, name: fullName(a.owner) })), [load])
  const curAnalyst = analyst ?? analysts[0] ?? null

  const analystFn = useCallback(() => curAnalyst ? getDailyVolume(month, curAnalyst.owner) : Promise.resolve(null), [month, curAnalyst])
  const { data: aData } = usePolling(analystFn, 5 * 60_000)

  // "Resolvido" real = resolvidos + fechados (o estado "Resolvido" é transitório → vira "fechado")
  const norm = useMemo(() => (daily?.points ?? []).map(p => ({ ...p, resolvidos: (p.resolvidos ?? 0) + (p.fechados ?? 0) })), [daily])
  const fluxo = useMemo(() => withAnomaly(norm), [norm])
  const kpis = useMemo(() => {
    const totalIn = norm.reduce((s, p) => s + (p.criados ?? 0), 0)
    const totalOut = norm.reduce((s, p) => s + (p.resolvidos ?? 0), 0)
    const saldo = totalIn - totalOut
    const peak = norm.reduce((a, b) => ((b.criados ?? 0) > (a?.criados ?? -1) ? b : a), null)
    return { totalIn, taxa: totalIn ? (totalOut / totalIn) * 100 : 0, saldo, peak }
  }, [norm])

  const backlog = useMemo(() => {
    let acc = 0
    return fluxo.map(p => { acc += (p.criados ?? 0) - (p.resolvidos ?? 0); return { label: p.label, backlog: acc } })
  }, [fluxo])

  const aSerie = useMemo(() => (aData?.points ?? []).map(p => ({ label: p.date, trabalhados: p.trabalhados ?? 0, resolvidos: p.resolvidos ?? 0 })), [aData])
  const anoms = fluxo.filter(p => p.anomaly)

  return (
    <div style={{ fontFamily: FONT, color: INK }} className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-[16px] font-bold">Histórico Operacional</h1>
        <div className="flex gap-0.5 p-[3px] rounded-[9px] flex-wrap" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          {MONTHS.map(m => <button key={m} onClick={() => setMonth(m)} className="text-[11px] px-2.5 py-1.5 rounded-md transition-colors" style={month === m ? { background: ELEV, color: INK } : { color: MUTED }}>{fmtMonth(m)}</button>)}
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Volume de Entrada" value={kpis.totalIn.toLocaleString('pt-BR')} sub={`chamados criados · ${fmtMonth(month)}`} />
        <Kpi label="Taxa de Resolução" value={`${kpis.taxa.toFixed(1)}%`} sub="resolvidos ÷ criados" />
        <Kpi label="Backlog" value={kpis.saldo > 0 ? `+${kpis.saldo}` : kpis.saldo} arrow={kpis.saldo <= 0 ? '▼' : '▲'} tone={kpis.saldo <= 0 ? C.good : C.crit} sub={kpis.saldo <= 0 ? 'backlog reduziu no período' : 'backlog cresceu no período'} />
        <Kpi label="Dia de Maior Pico" value={kpis.peak ? kpis.peak.date : '—'} sub={kpis.peak ? `${kpis.peak.criados} chamados criados` : ''} />
      </section>

      {/* Fluxo */}
      <Panel title="Fluxo Diário — Criados vs Resolvidos"
        right={<span className="text-[10px] normal-case tracking-normal" style={{ color: FAINT }}>clique num dia p/ ver os chamados · ● anomalia — passe o mouse</span>}>
        {dailyLoad ? <div className="h-[260px] rounded-lg animate-pulse" style={{ background: `${BORDER}66` }} /> : fluxo.length === 0 ? <p className="text-xs py-16 text-center" style={{ color: FAINT }}>Sem dados no período.</p> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={fluxo} margin={{ top: 12, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%"
              onClick={e => { if (e?.activePayload?.[0]) { const p = e.activePayload[0].payload; setDayDrawer({ dia: p.dia, label: p.label }) } }} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
              <YAxis {...axisProps} />
              <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend iconType="circle" wrapperStyle={legendStyle} formatter={v => <span style={{ color: MUTED }}>{NAMES[v] ?? v}</span>} />
              <Bar dataKey="criados" fill={C.accent} radius={[3, 3, 0, 0]} onClick={(d) => setDayDrawer({ dia: (d.payload ?? d).dia, label: (d.payload ?? d).label })}><LabelList dataKey="criados" position="top" fontSize={8.5} fill={MUTED} /></Bar>
              <Bar dataKey="resolvidos" fill={C.good} radius={[3, 3, 0, 0]} onClick={(d) => setDayDrawer({ dia: (d.payload ?? d).dia, label: (d.payload ?? d).label })}><LabelList dataKey="resolvidos" position="top" fontSize={8.5} fill={MUTED} /></Bar>
              {anoms.map(a => <ReferenceDot key={a.label} x={a.label} y={a.criados} r={6} fill={C.crit} stroke={INK} strokeWidth={1.5} isFront />)}
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* Evolução do Backlog */}
      <Panel title="Evolução do Backlog — saldo acumulado (criados − resolvidos)"
        right={<span className="text-[10px] normal-case tracking-normal" style={{ color: FAINT }}>subindo = fila crescendo · descendo = equipe reduzindo</span>}>
        {dailyLoad ? <div className="h-[220px] rounded-lg animate-pulse" style={{ background: `${BORDER}66` }} /> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={backlog} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <defs><linearGradient id="g-backlog" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.serious} stopOpacity={0.5} /><stop offset="100%" stopColor={C.serious} stopOpacity={0.04} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
              <YAxis {...axisProps} />
              <Tooltip content={<DarkTooltip />} cursor={{ stroke: BORDER }} />
              <Area type="monotone" dataKey="backlog" stroke={C.serious} strokeWidth={2.5} fill="url(#g-backlog)" dot={false} activeDot={{ r: 4, fill: C.serious }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* Produtividade por analista */}
      <Panel title="Produtividade por Analista"
        right={
          <div className="relative">
            <button onClick={() => setSelOpen(o => !o)} className="text-[12px] px-3 py-1.5 rounded-lg flex items-center gap-2" style={{ background: DEEP, border: `1px solid ${BORDER}`, color: INK }}>
              <span className="w-2 h-2 rounded-full" style={{ background: C.accent }} />{curAnalyst?.name ?? '—'}<span style={{ fontSize: 8, color: MUTED }}>▼</span>
            </button>
            {selOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSelOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 py-1 rounded-lg min-w-[190px] max-h-[300px] overflow-y-auto" style={{ background: ELEV, border: `1px solid ${BORDER}`, boxShadow: '0 10px 28px rgba(0,0,0,.45)' }}>
                  {analysts.map(a => <button key={a.owner} onClick={() => { setAnalyst(a); setSelOpen(false) }} className="w-full text-left text-[12px] px-3 py-1.5 transition-colors hover:bg-[#232d40]" style={{ color: a.owner === curAnalyst?.owner ? C.accent : INK }}>{a.name}</button>)}
                </div>
              </>
            )}
          </div>
        }>
        {!curAnalyst ? <p className="text-xs py-16 text-center" style={{ color: FAINT }}>Sem analistas no período.</p> : (
          <>
            <p className="text-[13px] font-bold mb-3" style={{ color: INK }}>{curAnalyst.name}</p>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={aSerie} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
                <defs><linearGradient id="g-trab" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.32} /><stop offset="100%" stopColor={C.accent} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...axisProps} width={34} />
                <Tooltip content={<DarkTooltip />} cursor={{ stroke: BORDER }} />
                <Legend iconType="plainline" wrapperStyle={legendStyle} formatter={v => <span style={{ color: MUTED }}>{NAMES[v] ?? v}</span>} />
                <Area type="monotone" dataKey="trabalhados" stroke={C.accent} strokeWidth={2.5} fill="url(#g-trab)" dot={false} activeDot={{ r: 4, fill: C.accent }} />
                <Line type="monotone" dataKey="resolvidos" stroke={C.good} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: C.good }} />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </Panel>

      <p className="text-[10px] text-center pb-2" style={{ color: FAINT }}>Dados reais · GET /metrics/daily-volume · anomalia calculada no cliente (média móvel 7d)</p>

      {dayDrawer && <DayDrawer dia={dayDrawer.dia} label={dayDrawer.label} onClose={() => setDayDrawer(null)} />}
    </div>
  )
}
