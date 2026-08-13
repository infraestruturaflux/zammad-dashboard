// ── Desempenho Operacional (REDESIGN — ligado ao backend real) ────────────────
// Cockpit (MTTR/FCR/MTTA), Raio-X das filas (volume por estado) e Leaderboard
// rico (tempos úteis/corridas). Dados reais via API.
import { useCallback, useMemo, useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import {
  getMTTRStats, getMTTAStats, getAnalystPerformance,
  getVolumeByGroup, getVolumeStatusDetail, getTeamStatus, getAnalystTickets,
} from '../api/client'

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = { good: '#34d399', warn: '#fbbf24', serious: '#fb923c', crit: '#f87171', critdark: '#dc2626', accent: '#4f9cf9', violet: '#a78bfa' }
const TONE = { good: C.good, warn: C.warn, serious: C.serious, crit: C.crit, critdark: C.critdark }
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

// ── Estados dos tickets (para o Raio-X e drawer) ──────────────────────────────
const STATE_META = {
  em_atendimento: { label: 'Em Atend.',     color: C.accent },
  ag_cliente:     { label: 'Ag. Cliente',   color: C.warn },
  ag_terceiros:   { label: 'Ag. Terceiros', color: C.serious },
  escalonado:     { label: 'Escalonado',    color: C.violet },
  resolvido:      { label: 'Resolvido',     color: C.good },
  fechado:        { label: 'Fechado',       color: '#64748b' },
  novo:           { label: 'Novo',          color: C.crit },
}
const STATE_ORDER = ['em_atendimento', 'ag_cliente', 'ag_terceiros', 'escalonado', 'resolvido', 'fechado', 'novo']
const tstateColor = s => {
  const l = (s || '').toLowerCase()
  if (l.includes('em atend')) return C.accent
  if (l.includes('escalonado')) return C.violet
  if (l.includes('cliente')) return C.warn
  if (l.includes('terceiro')) return C.serious
  if (l.includes('resolvido')) return C.good
  return MUTED
}

// ── Categorias (mapeamento dos grupos reais do Zammad) ────────────────────────
const GROUP_CATEGORY = {
  'sbc': 'produtos', 'pabx': 'produtos', 'omnichannel': 'produtos', 'softphone': 'produtos',
  'ativações de produtos': 'produtos', 'sms': 'produtos', 'whatsapp': 'produtos',
  'entrantes': 'noc', 'rotas': 'noc', 'rotas / wholesale': 'noc', 'escalonamento fornecedor': 'noc',
  'suporte infraestrutura': 'infra_dev', 'desenvolvimento': 'infra_dev', 'suporte n2': 'infra_dev',
  'implantação de software': 'infra_dev', 'escalonamento/plantão': 'infra_dev',
}
const CATEGORY_TITLES = { produtos: 'Produtos', noc: 'NOC', infra_dev: 'Infraestrutura / Desenvolvimento', outros: 'Outros' }
const CATEGORY_ORDER = ['produtos', 'noc', 'infra_dev', 'outros']
// Grupos que NÃO aparecem no Raio-X (não-operacionais + os que o time não acompanha)
const GROUP_BLOCK = new Set([
  'portabilidade', 'informativo', "ativações de tn's", 'saldo', 'saintes',
  'portal ativação - número', 'portabilidade > portabilidade interna',
  'whatsapp', 'escalonamento fornecedor', 'suporte n2',
])
const catOf = name => GROUP_CATEGORY[(name || '').trim().toLowerCase()] ?? 'outros'

// ── Gauge (MTTR) ──────────────────────────────────────────────────────────────
function GaugeMTTR({ value, meta = 24, fmt }) {
  const max = meta * 1.5   // deixa a meta em ~66% do arco, com zona vermelha acima dela
  const A0 = -210, A1 = 30, rad = a => (a * Math.PI) / 180
  const ang = v => A0 + (Math.min(v ?? 0, max) / max) * (A1 - A0)
  const R = 80, cx = 100, cy = 100
  const pt = (a, r = R) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))]
  const arc = (a0, a1, color, key) => {
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1); const large = a1 - a0 > 180 ? 1 : 0
    return <path key={key} d={`M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" />
  }
  const [nx, ny] = pt(ang(value), R - 14)
  const dentro = value != null && value <= meta
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 128" width="100%" style={{ maxWidth: 210 }}>
        {arc(A0, ang(meta * 0.66), C.good, 'g')}{arc(ang(meta * 0.66), ang(meta), C.warn, 'w')}{arc(ang(meta), A1, C.crit, 'c')}
        {value != null && <><line x1={cx} y1={cy} x2={nx} y2={ny} stroke={INK} strokeWidth="3" strokeLinecap="round" /><circle cx={cx} cy={cy} r="5" fill={INK} /></>}
        <text x={cx} y="92" textAnchor="middle" fontSize={fmt && fmt.length > 6 ? 17 : 24} fontWeight="700" fill={INK}>{value == null ? '—' : (fmt ?? `${value}h`)}</text>
      </svg>
      <p className="text-[11px] -mt-1" style={{ color: value == null ? FAINT : dentro ? C.good : C.crit }}>meta {meta}h {value == null ? '' : dentro ? '✔ dentro' : '✖ acima'}</p>
    </div>
  )
}

// ── Ring (FCR) ────────────────────────────────────────────────────────────────
function RingFCR({ value, meta = 80 }) {
  const R = 70, SW = 13, CIRC = 2 * Math.PI * R
  const v = value ?? 0, dash = (v / 100) * CIRC
  const color = value == null ? BORDER : v >= meta ? C.good : v >= meta * 0.85 ? C.warn : C.crit
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 180" width="100%" style={{ maxWidth: 168 }}>
        <g transform="translate(90,90) rotate(-90)">
          <circle r={R} fill="none" stroke={BORDER} strokeWidth={SW} />
          <circle r={R} fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeDasharray={`${dash} ${CIRC - dash}`} />
        </g>
        <text x="90" y="86" textAnchor="middle" fontSize="34" fontWeight="700" fill={INK}>{value == null ? '—' : `${v}%`}</text>
        <text x="90" y="108" textAnchor="middle" fontSize="11" fill={MUTED}>FCR</text>
      </svg>
      <p className="text-[11px] -mt-1" style={{ color: value == null ? FAINT : v >= meta ? C.good : C.crit }}>meta {meta}% {value == null ? '' : v >= meta ? '✔' : '✖'}</p>
    </div>
  )
}

// ── Tooltip de glossário ──────────────────────────────────────────────────────
function InfoTip({ text }) {
  return (
    <span className="relative inline-flex items-center group align-middle ml-1">
      <span className="cursor-help text-[11px] leading-none" style={{ color: FAINT }}>ⓘ</span>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 z-[60] w-max max-w-[240px] px-3 py-2 rounded-lg text-[11px] leading-snug normal-case tracking-normal text-left font-normal opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ background: ELEV, border: `1px solid ${BORDER}`, color: INK, boxShadow: '0 10px 28px rgba(0,0,0,.5)' }}>{text}
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full w-2 h-2 rotate-45" style={{ background: ELEV, borderLeft: `1px solid ${BORDER}`, borderTop: `1px solid ${BORDER}`, marginBottom: -4 }} />
      </span>
    </span>
  )
}
const GLOSS = {
  mttr: 'MTTR — Mean Time To Resolve: tempo médio entre abertura e resolução (horas úteis). Meta 24h úteis.',
  fcr: 'FCR — First Contact Resolution: % resolvidos no 1º contato, sem reabertura. Média da equipe.',
  mtta: 'MTTA — Mean Time To Assign: tempo médio até a 1ª ação do analista.',
  ativos: 'Tickets atualmente atribuídos ao analista e ainda abertos (carga instantânea).',
  ativo: 'Tempo com o ticket em atendimento (de fato trabalhando nele).',
  agc: 'Tempo parado aguardando retorno do cliente — não conta contra o SLA do analista.',
  agt: 'Tempo parado aguardando fornecedor/terceiro — não conta contra o SLA do analista.',
  pct: 'Proporção do tempo Ativo sobre o total (Ativo + Ag. Cliente + Ag. Terceiros).',
  modo: 'Horas Úteis = 08h–19h, seg–sex. Horas Corridas = relógio 24h, incluindo noites e fins de semana.',
}

function Panel({ title, right, children }) {
  return (
    <div className="rounded-[13px] p-[18px]" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      {title && <div className="flex items-center justify-between mb-4 flex-wrap gap-2"><p className="text-[10.5px] uppercase tracking-[1.4px] font-semibold" style={{ color: FAINT }}>{title}</p>{right}</div>}
      {children}
    </div>
  )
}

// ── Barra de estados de uma fila (100% stacked por estado) ────────────────────
function FilaBar({ name, by_state, total, onSeg }) {
  const entries = STATE_ORDER.filter(k => by_state[k] > 0).map(k => [k, by_state[k]])
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[12.5px] w-40 shrink-0 truncate" style={{ color: INK }} title={name}>{name}</span>
      <div className="flex-1 h-[18px] rounded-md overflow-hidden flex" style={{ background: DEEP, border: `1px solid ${BORDER}` }} title={`${total} tickets`}>
        {entries.map(([k, n]) => (
          <button key={k} onClick={() => onSeg({ type: 'fila', group: name, status: k, count: n })} title={`${STATE_META[k].label} — ${n}`}
            className="h-full transition-opacity hover:opacity-80" style={{ width: `${(n / total) * 100}%`, background: STATE_META[k].color, cursor: 'pointer' }} />
        ))}
      </div>
      <span className="text-[11px] tabular-nums w-10 text-right shrink-0" style={{ color: MUTED }}>{total}</span>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function Th({ children, className = '' }) { return <th className={`py-2 text-[10.5px] uppercase tracking-wider font-semibold ${className}`} style={{ color: FAINT }}>{children}</th> }
function InlineBar({ pct, color }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: BORDER }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
      <span className="text-[12px] tabular-nums w-9 text-right" style={{ color: INK }}>{pct}%</span>
    </div>
  )
}
function Leaderboard({ rows, mode, loading, onPick }) {
  if (loading) return <div className="h-40 rounded-lg animate-pulse" style={{ background: `${BORDER}66` }} />
  if (!rows.length) return <p className="text-xs py-6 text-center" style={{ color: FAINT }}>Sem dados de eventos para este período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[940px]">
        <thead>
          <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
            <Th className="pr-4">Analista</Th>
            <Th className="text-center px-3">Tickets</Th>
            <Th className="text-center px-3">Ativos<InfoTip text={GLOSS.ativos} /></Th>
            <Th className="px-3 w-32">FCR<InfoTip text={GLOSS.fcr} /></Th>
            <Th className="text-right px-3">Ativo<InfoTip text={GLOSS.ativo} /></Th>
            <Th className="text-right px-3">Ag. Cliente<InfoTip text={GLOSS.agc} /></Th>
            <Th className="text-right px-3">Ag. Terceiros<InfoTip text={GLOSS.agt} /></Th>
            <Th className="px-3 w-32">% Ativo<InfoTip text={GLOSS.pct} /></Th>
            <Th className="pl-3">Sinais</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(a => {
            const pctColor = a.pctAtivo == null ? BORDER : a.pctAtivo >= 70 ? C.good : a.pctAtivo >= 45 ? C.warn : C.crit
            return (
              <tr key={a.owner} onClick={() => onPick({ type: 'analyst', owner: a.owner, name: a.name })} className="cursor-pointer transition-colors hover:bg-[#1a2233]" style={{ borderBottom: `1px solid ${BORDER}55` }}>
                <td className="py-3 pr-4 text-[13px] font-medium whitespace-nowrap" style={{ color: INK }}>{a.name}</td>
                <td className="py-3 px-3 text-center text-[13px] tabular-nums font-bold" style={{ color: C.accent }}>{a.tickets}</td>
                <td className="py-3 px-3 text-center">
                  {a.ativos == null ? <span className="text-[13px]" style={{ color: FAINT }}>—</span> : (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: a.cargaTone }} />
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: a.cargaTone }}>{a.ativos}</span>
                    </span>
                  )}
                </td>
                <td className="py-3 px-3">{a.fcr == null ? <span className="text-[13px]" style={{ color: FAINT }}>—</span> : <InlineBar pct={a.fcr} color={a.fcr >= 80 ? C.good : a.fcr >= 68 ? C.warn : C.crit} />}</td>
                <td className="py-3 px-3 text-right text-[13px] tabular-nums whitespace-nowrap" style={{ color: INK }}>{a.ativoFmt}</td>
                <td className="py-3 px-3 text-right text-[13px] tabular-nums whitespace-nowrap" style={{ color: MUTED }}>{a.agcFmt}</td>
                <td className="py-3 px-3 text-right text-[13px] tabular-nums whitespace-nowrap" style={{ color: MUTED }}>{a.agtFmt}</td>
                <td className="py-3 px-3">{a.pctAtivo == null ? <span className="text-[13px]" style={{ color: FAINT }}>—</span> : <InlineBar pct={a.pctAtivo} color={pctColor} />}</td>
                <td className="py-3 pl-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {a.tags.length === 0 && <span className="text-[12px]" style={{ color: FAINT }}>—</span>}
                    {a.tags.map(t => <span key={t.label} className="text-[10.5px] px-2 py-0.5 rounded-md font-medium whitespace-nowrap" style={{ color: TONE[t.tone], background: `${TONE[t.tone]}1f` }}>{t.label}</span>)}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Drawer (fila OU analista) — busca real ────────────────────────────────────
function DrawerP({ ctx, month, onClose }) {
  const isFila = ctx.type === 'fila'
  const fetchFn = useCallback(() => isFila ? getVolumeStatusDetail(ctx.group, ctx.status, month) : getAnalystTickets(ctx.owner), [ctx, month, isFila])
  const { data, loading } = usePolling(fetchFn, 0)
  const [q, setQ] = useState('')
  const all = data?.tickets ?? []
  const term = q.trim().toLowerCase()
  const tickets = all.filter(t => !term || String(t.number).includes(term) || (t.title || '').toLowerCase().includes(term) || fullName(t.owner).toLowerCase().includes(term))
  const title = isFila ? ctx.group : ctx.name
  const sub = isFila ? (STATE_META[ctx.status]?.label ?? ctx.status) : 'Tickets ativos'
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg z-50 flex flex-col shadow-2xl" style={{ background: SURFACE, borderLeft: `1px solid ${BORDER}`, fontFamily: FONT, animation: 'noc-slide .22s ease-out' }}>
        <style>{`@keyframes noc-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
        <div className="flex items-start justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="min-w-0">
            <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.accent }}>{isFila ? 'Fila' : 'Analista'}</span>
            <p className="text-base font-bold mt-0.5 truncate" style={{ color: INK }} title={title}>{title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ color: C.accent, background: `${C.accent}1f` }}>{sub}</span>
              <span className="text-[12px]" style={{ color: MUTED }}>{loading ? '…' : <><b style={{ color: INK }}>{tickets.length}</b> chamados</>}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-xl leading-none shrink-0" style={{ color: MUTED }}>✕</button>
        </div>
        <div className="px-5 pt-3 pb-1 shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: FAINT }}>🔍</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por nº, título ou analista…" className="w-full pl-8 pr-3 py-2 rounded-lg text-[12px] outline-none" style={{ background: DEEP, border: `1px solid ${BORDER}`, color: INK }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-1 flex flex-col gap-0.5">
          {loading && <div className="h-8 rounded animate-pulse mt-2" style={{ background: `${BORDER}66` }} />}
          {!loading && tickets.length === 0 && <p className="text-xs text-center py-8" style={{ color: FAINT }}>Nenhum chamado.</p>}
          {tickets.map(t => (
            <div key={t.number} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}55` }}>
              <span className="text-[11px] tabular-nums shrink-0 mt-0.5 w-[52px]" style={{ color: FAINT }}>#{t.number}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug" style={{ color: INK }}>{t.title}</p>
                {isFila && (t.owner || t.customer) && <p className="text-[11px] mt-1" style={{ color: MUTED }}>{t.owner ? `🔧 ${fullName(t.owner)}` : ''}{t.customer ? `  👤 ${t.customer}` : ''}</p>}
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
export default function PerformanceNew() {
  const [month, setMonth] = useState(currentMonthISO())
  const [mode, setMode] = useState('biz')   // 'biz' | 'wall'
  const [drawer, setDrawer] = useState(null)

  const mttrFn = useCallback(() => getMTTRStats(month), [month])
  const mttaFn = useCallback(() => getMTTAStats(month), [month])
  const perfFn = useCallback(() => getAnalystPerformance(month), [month])
  const groupsFn = useCallback(() => getVolumeByGroup(month), [month])
  const statusFn = useCallback(() => getTeamStatus(), [])

  const { data: mttr, loading: mttrLoad } = usePolling(mttrFn, 5 * 60_000)
  const { data: mtta } = usePolling(mttaFn, 5 * 60_000)
  const { data: perf, loading: perfLoad } = usePolling(perfFn, 5 * 60_000)
  const { data: groups, loading: groupsLoad } = usePolling(groupsFn, 5 * 60_000)
  const { data: status } = usePolling(statusFn, 30_000)

  // Mapas por NOME (analyst-performance usa nome; team-status traz nome+e-mail)
  const { totalByName, emailByName } = useMemo(() => {
    const totalByName = {}, emailByName = {}
    ;(status?.analysts ?? []).forEach(a => {
      const key = a.name || fullName(a.owner)
      totalByName[key] = a.total; emailByName[key] = a.owner
    })
    return { totalByName, emailByName }
  }, [status])

  // FCR médio da equipe
  const fcrAvg = useMemo(() => {
    const vals = (perf?.analysts ?? []).map(a => a.fcr_pct).filter(v => v != null)
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null
  }, [perf])

  // "Ativos" é a carga ATUAL (ao vivo) — só faz sentido no mês corrente
  const isCurrentMonth = month === currentMonthISO()

  // Linhas do leaderboard
  const rows = useMemo(() => (perf?.analysts ?? []).map(a => {
    const g = (field) => mode === 'biz'
      ? { h: a[`${field}_biz_h`], fmt: a[`${field}_fmt`] }
      : { h: a[`${field}_wall_h`], fmt: a[`${field}_wall_fmt`] }
    const act = g('active'), cli = g('ag_cliente'), ter = g('ag_terceiros')
    const total = (act.h ?? 0) + (cli.h ?? 0) + (ter.h ?? 0)
    const pctAtivo = total > 0 ? Math.round(((act.h ?? 0) / total) * 100) : null
    const displayName = a.owner && a.owner.includes('@') ? fullName(a.owner) : a.owner  // perf já traz nome
    const ativos = isCurrentMonth ? (totalByName[displayName] ?? 0) : null
    const email = emailByName[displayName] ?? a.owner
    const cargaTone = ativos == null ? FAINT : ativos > 12 ? C.critdark : ativos > 8 ? C.warn : C.good
    const tags = []
    if (a.fcr_pct != null && a.fcr_pct >= 85) tags.push({ label: 'Alta Eficiência', tone: 'good' })
    if (a.fcr_pct != null && a.fcr_pct < 65) tags.push({ label: 'Alerta FCR', tone: 'crit' })
    if (pctAtivo != null && pctAtivo < 35) tags.push({ label: 'Muita Espera', tone: 'serious' })
    if (isCurrentMonth && ativos > 12) tags.push({ label: 'Sobrecarga', tone: 'critdark' })
    return {
      owner: email, name: displayName, tickets: a.tickets_count,
      ativos, cargaTone, fcr: a.fcr_pct ?? null,
      ativoFmt: (act.h ?? 0) > 0 ? act.fmt : '—', agcFmt: (cli.h ?? 0) > 0 ? cli.fmt : '—', agtFmt: (ter.h ?? 0) > 0 ? ter.fmt : '—',
      pctAtivo, tags,
    }
  }), [perf, mode, totalByName, emailByName, isCurrentMonth])

  // Raio-X — agrupa filas reais nas 3 categorias
  const categories = useMemo(() => {
    const byCat = {}
    ;(groups?.groups ?? []).forEach(g => {
      if (GROUP_BLOCK.has((g.name || '').trim().toLowerCase())) return
      const cat = catOf(g.name);(byCat[cat] ??= []).push(g)
    })
    return CATEGORY_ORDER.filter(c => byCat[c]?.length).map(c => ({ key: c, title: CATEGORY_TITLES[c], itens: byCat[c].sort((a, b) => b.total - a.total) }))
  }, [groups])

  return (
    <div style={{ fontFamily: FONT, color: INK }} className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-[16px] font-bold">Desempenho Operacional</h1>
        <div className="flex gap-0.5 p-[3px] rounded-[9px] flex-wrap" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          {MONTHS.map(m => <button key={m} onClick={() => setMonth(m)} className="text-[11px] px-2.5 py-1.5 rounded-md transition-colors" style={month === m ? { background: ELEV, color: INK } : { color: MUTED }}>{fmtMonth(m)}</button>)}
        </div>
      </div>

      {/* Cockpit */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[13px] p-[18px] flex flex-col items-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <p className="text-[10.5px] uppercase tracking-[1.2px] font-semibold mb-2 text-center" style={{ color: FAINT }}>⌚ MTTR · Tempo de Resolução<InfoTip text={GLOSS.mttr} /></p>
          <GaugeMTTR value={mttr?.biz_mean_h ?? null} fmt={mttr?.biz_mean_fmt} />
        </div>
        <div className="rounded-[13px] p-[18px] flex flex-col items-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <p className="text-[10.5px] uppercase tracking-[1.2px] font-semibold mb-2 text-center" style={{ color: FAINT }}>◕ FCR · Resolução 1º Contato<InfoTip text={GLOSS.fcr} /></p>
          {perfLoad ? <div className="h-[168px] flex items-center justify-center text-[12px]" style={{ color: FAINT }}>calculando…</div> : <RingFCR value={fcrAvg} />}
        </div>
        <div className="rounded-[13px] p-[18px] flex flex-col items-center justify-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <p className="text-[10.5px] uppercase tracking-[1.2px] font-semibold mb-2 text-center" style={{ color: FAINT }}>MTTA · 1ª Resposta<InfoTip text={GLOSS.mtta} /></p>
          <span className="text-[26px] font-bold leading-none" style={{ color: INK }}>{mtta?.biz_mean_fmt ?? '—'}</span>
          <span className="text-[11px] mt-1.5" style={{ color: MUTED }}>horas úteis</span>
        </div>
        <div className="rounded-[13px] p-[18px] flex flex-col items-center justify-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <p className="text-[10.5px] uppercase tracking-[1.2px] font-semibold mb-2 text-center" style={{ color: FAINT }}>Resolvidos no período</p>
          <span className="text-[26px] font-bold leading-none" style={{ color: INK }}>{mttr?.count != null ? mttr.count.toLocaleString('pt-BR') : '—'}</span>
          <span className="text-[11px] mt-1.5" style={{ color: MUTED }}>chamados fechados</span>
        </div>
      </section>

      {/* Raio-X das filas */}
      <Panel title="Raio-X das Filas — volume por estado"
        right={
          <div className="flex items-center gap-2.5 flex-wrap">
            {STATE_ORDER.filter(k => ['em_atendimento', 'ag_cliente', 'ag_terceiros', 'escalonado', 'resolvido'].includes(k)).map(k => (
              <span key={k} className="flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}><span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATE_META[k].color }} />{STATE_META[k].label}</span>
            ))}
          </div>
        }>
        {groupsLoad && <div className="h-40 rounded-lg animate-pulse" style={{ background: `${BORDER}66` }} />}
        {!groupsLoad && !categories.length && <p className="text-xs py-6 text-center" style={{ color: FAINT }}>Sem dados no período.</p>}
        {!groupsLoad && categories.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {categories.map(cat => (
              <div key={cat.key} className="rounded-lg p-3.5" style={{ background: DEEP, border: `1px solid ${BORDER}` }}>
                <p className="text-[10.5px] uppercase tracking-[1.2px] font-semibold mb-2" style={{ color: C.accent }}>{cat.title}</p>
                {cat.itens.map(g => <FilaBar key={g.name} name={g.name} by_state={g.by_state} total={g.total} onSeg={setDrawer} />)}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Leaderboard */}
      <Panel title="Leaderboard de Analistas"
        right={
          <div className="flex items-center gap-2">
            <InfoTip text={GLOSS.modo} />
            <div className="flex gap-0.5 p-[3px] rounded-[9px]" style={{ background: DEEP, border: `1px solid ${BORDER}` }}>
              {[['biz', 'Horas Úteis'], ['wall', 'Horas Corridas']].map(([v, l]) => <button key={v} onClick={() => setMode(v)} className="text-[11px] px-2.5 py-1.5 rounded-md transition-colors" style={mode === v ? { background: ELEV, color: C.accent } : { color: MUTED }}>{l}</button>)}
            </div>
          </div>
        }>
        <Leaderboard rows={rows} mode={mode} loading={perfLoad} onPick={setDrawer} />
        <p className="text-[10px] mt-3" style={{ color: FAINT }}>
          {isCurrentMonth
            ? <>Ativos: <span style={{ color: C.good }}>● ≤8</span> · <span style={{ color: C.warn }}>9–12</span> · <span style={{ color: C.critdark }}>&gt;12</span> tickets · </>
            : <>Ativos (carga atual ao vivo) só aparece no mês corrente · </>}
          tempos em <b style={{ color: MUTED }}>{mode === 'biz' ? 'horas úteis (08h–19h seg–sex)' : 'horas corridas'}</b>
        </p>
      </Panel>

      <p className="text-[10px] text-center pb-2" style={{ color: FAINT }}>Dados reais · GET /metrics/mttr · /analyst-performance · /volume-by-group · /team-status</p>

      {drawer && <DrawerP ctx={drawer} month={month} onClose={() => setDrawer(null)} />}
    </div>
  )
}
