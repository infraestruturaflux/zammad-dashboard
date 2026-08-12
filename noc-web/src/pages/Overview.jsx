// ── Visão Operacional (REDESIGN — ligado ao backend real) ─────────────────────
// Home "ao vivo": KPIs do termômetro de fila, Carga da Equipe, Feed do dia e
// Alertas de SLA — tudo real via API. Drill-down por estado e por analista.
import { useCallback, useMemo, useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { getQueue, getTeamStatus, getTodayFeed, getSLAAlerts, getStateTickets, getAnalystTickets, getTodayAnalystLoad, getDayTickets } from '../api/client'

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = { good: '#34d399', warn: '#fbbf24', serious: '#fb923c', crit: '#f87171', accent: '#4f9cf9', violet: '#a78bfa' }
const INK = '#e8eef7', MUTED = '#8b97a8', FAINT = '#5b6675'
const SURFACE = '#131a26', BORDER = '#232d40', DEEP = '#0b0f17', ELEV = '#1a2233'
const FONT = "'Inter', system-ui, sans-serif"

function fullName(owner) {
  if (!owner || owner === '-') return owner ?? '?'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local.split(/[.\s_-]+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}
function fmtAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}m`
  const h = Math.floor(min / 60); if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
const tstateColor = s => {
  const l = (s || '').toLowerCase()
  if (l.includes('em atend')) return C.accent
  if (l.includes('escalonado')) return C.violet
  if (l.includes('cliente')) return C.warn
  if (l.includes('terceiro')) return C.serious
  if (l.includes('resolvido')) return C.good
  if (l.includes('aberto') || l.includes('novo')) return C.crit
  return MUTED
}

// KPIs do termômetro (queue) — goodUp=false → subir é ruim
const KPI_DEFS = [
  { bucket: 'abertos',      label: 'Abertos',         key: 'chamados_abertos',     tkey: 'trend_chamados_abertos',     goodUp: false },
  { bucket: 'em_atend',     label: 'Em Atendimento',  key: 'em_atendimento',       tkey: 'trend_em_atendimento',       goodUp: false },
  { bucket: 'ag_cliente',   label: 'Ag. Cliente',     key: 'aguardando_cliente',   tkey: 'trend_aguardando_cliente',   goodUp: false },
  { bucket: 'ag_terceiros', label: 'Ag. Terceiros',   key: 'aguardando_terceiros', tkey: 'trend_aguardando_terceiros', goodUp: false },
  { bucket: 'resolvidos',   label: 'Resolvidos Hoje', key: 'resolvidos_hoje',      tkey: 'trend_resolvidos_hoje',      goodUp: true  },
]

// ── KPI card (clicável) ───────────────────────────────────────────────────────
function KpiCard({ def, queue, onClick }) {
  const value = queue?.[def.key]
  const trend = queue?.[def.tkey]
  const hasTrend = trend != null && trend !== 0
  const improved = hasTrend && ((trend < 0) !== def.goodUp)  // baixar é bom (goodUp false)
  const tColor = !hasTrend ? MUTED : improved ? C.good : C.crit
  const clickable = !!onClick
  return (
    <button onClick={onClick} disabled={!clickable} className={`relative overflow-hidden rounded-[13px] p-4 text-left w-full transition-all duration-150 group ${clickable ? 'hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'}`}
      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      <div className="flex justify-between items-start mb-3">
        <span className="text-[11.5px]" style={{ color: MUTED }}>{def.label}</span>
        {hasTrend && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: tColor, background: `${tColor}1f` }}>{trend < 0 ? '▼' : '▲'} {Math.abs(trend)}%</span>}
      </div>
      <div className="text-[30px] font-bold leading-none tabular-nums" style={{ color: INK }}>{value ?? '—'}</div>
      <div className="text-[11px] mt-2" style={{ color: FAINT }}>{hasTrend ? 'vs. ontem útil' : 'sem comparativo'}</div>
      {clickable && <span className="absolute right-3 top-3 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: MUTED }}>ver ▸</span>}
    </button>
  )
}

function Panel({ title, right, children, className = '' }) {
  return (
    <div className={`rounded-[13px] p-[18px] flex flex-col ${className}`} style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between mb-3 shrink-0 flex-wrap gap-2">
        <p className="text-[10.5px] uppercase tracking-[1.4px] font-semibold" style={{ color: FAINT }}>{title}</p>
        {right}
      </div>
      {children}
    </div>
  )
}

// ── Drawer (estado OU analista) — busca real ──────────────────────────────────
function OpDrawer({ ctx, onClose }) {
  const isState = ctx.type === 'state'
  const fetchFn = useCallback(() => isState ? getStateTickets(ctx.bucket) : getAnalystTickets(ctx.owner), [ctx, isState])
  const { data, loading } = usePolling(fetchFn, 0)
  const [q, setQ] = useState('')
  const all = data?.tickets ?? []
  const term = q.trim().toLowerCase()
  const tickets = all.filter(t => !term || String(t.number).includes(term) || (t.title || '').toLowerCase().includes(term) || fullName(t.owner).toLowerCase().includes(term))
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg z-50 flex flex-col shadow-2xl" style={{ background: SURFACE, borderLeft: `1px solid ${BORDER}`, fontFamily: FONT, animation: 'noc-slide .22s ease-out' }}>
        <style>{`@keyframes noc-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
        <div className="flex items-start justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="min-w-0">
            <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.accent }}>{isState ? 'Estado' : 'Analista'}</span>
            <p className="text-base font-bold mt-0.5 truncate" style={{ color: INK }}>{ctx.label}</p>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>{loading ? '…' : <><b style={{ color: INK }}>{tickets.length}</b>{term ? ` de ${all.length}` : ''} chamados</>}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none shrink-0" style={{ color: MUTED }}>✕</button>
        </div>
        <div className="px-5 pt-3 pb-1 shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: FAINT }}>🔍</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por nº, título ou analista…" className="w-full pl-8 pr-3 py-2 rounded-lg text-[12px] outline-none" style={{ background: DEEP, border: `1px solid ${BORDER}`, color: INK }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-1 flex flex-col">
          {loading && <div className="h-8 rounded animate-pulse mt-2" style={{ background: `${BORDER}66` }} />}
          {!loading && tickets.length === 0 && <p className="text-xs text-center py-8" style={{ color: FAINT }}>Nenhum chamado.</p>}
          {tickets.map(t => (
            <div key={t.number} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}55` }}>
              <span className="text-[11px] tabular-nums shrink-0 mt-0.5 w-[52px]" style={{ color: FAINT }}>#{t.number}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug" style={{ color: INK }}>{t.title}</p>
                {isState && t.owner && t.owner.trim() !== '-' && <p className="text-[11px] mt-1" style={{ color: MUTED }}>🔧 {fullName(t.owner)}</p>}
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
export default function Overview() {
  const [drawer, setDrawer] = useState(null)
  const [date, setDate] = useState(null)   // null = hoje (ao vivo)
  const isToday = !date
  const todayISO = new Date().toISOString().slice(0, 10)

  const { data: queue } = usePolling(useCallback(() => getQueue(date || null), [date]), isToday ? 15_000 : 0)
  const { data: cargaData, loading: teamLoad } = usePolling(useCallback(() => isToday ? getTeamStatus() : getTodayAnalystLoad(date), [isToday, date]), isToday ? 30_000 : 0)
  const { data: feed, loading: feedLoad } = usePolling(useCallback(() => isToday ? getTodayFeed() : getDayTickets(date), [isToday, date]), isToday ? 20_000 : 0)
  const { data: sla } = usePolling(useCallback(() => isToday ? getSLAAlerts() : Promise.resolve({ alerts: [] }), [isToday]), isToday ? 30_000 : 0)

  const workload = useMemo(() => {
    const src = cargaData?.analysts ?? cargaData?.items ?? []
    return src.map(a => ({ owner: a.owner, name: a.name || fullName(a.owner), active: a.total ?? a.ticket_count ?? 0 }))
      .sort((a, b) => b.active - a.active)
  }, [cargaData])
  const teamAvg = workload.length ? Math.round(workload.reduce((s, a) => s + a.active, 0) / workload.length) : 0
  const maxLoad = workload[0]?.active ?? 1
  const loadColor = n => n > 12 ? C.crit : n > 8 ? C.warn : C.good

  const feedTickets = (feed?.tickets ?? []).slice(0, 14)
  const feedCount = feed?.count ?? feed?.total ?? feedTickets.length
  const alerts = sla?.alerts ?? []

  return (
    <div style={{ fontFamily: FONT, color: INK }} className="flex flex-col gap-5 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5 font-bold text-[15px]">
          <span className="w-2 h-2 rounded-full" style={{ background: isToday ? C.good : C.warn, boxShadow: `0 0 8px ${isToday ? C.good : C.warn}` }} />
          NOC · Visão Operacional
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setDate(null)} className="text-[11px] px-2.5 py-1.5 rounded-md transition-colors" style={isToday ? { background: ELEV, color: INK, border: `1px solid ${BORDER}` } : { color: MUTED, border: `1px solid ${BORDER}` }}>Hoje</button>
          <input type="date" value={date || ''} max={todayISO} onChange={e => setDate(e.target.value || null)}
            className="text-[11px] px-2.5 py-1.5 rounded-md outline-none [color-scheme:dark]" style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: date ? INK : MUTED }} />
          <span className="text-[11px]" style={{ color: isToday ? FAINT : C.warn }}>{isToday ? 'ao vivo · atualiza sozinho' : `snapshot de ${date.split('-').reverse().join('/')}`}</span>
        </div>
      </div>

      {/* KPIs */}
      <section className="shrink-0">
        <p className="text-[10.5px] uppercase tracking-[1.4px] font-semibold mb-3" style={{ color: FAINT }}>Saúde da Operação · {isToday ? 'agora' : date.split('-').reverse().join('/')}</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          {KPI_DEFS.map(def => (
            <KpiCard key={def.bucket} def={def} queue={queue}
              onClick={isToday ? () => setDrawer({ type: 'state', bucket: def.bucket, label: def.label }) : undefined} />
          ))}
        </div>
        {!isToday && !queue && <p className="text-[11px] mt-3" style={{ color: C.warn }}>Sem snapshot salvo para esta data — os KPIs históricos existem a partir de quando o dashboard começou a registrar (os dias vão se acumulando).</p>}
      </section>

      {/* Carga da equipe + Feed */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 flex-1 min-h-[420px]">
        {/* Carga da equipe */}
        <Panel title={`Carga da Equipe · ${isToday ? 'agora' : date.split('-').reverse().join('/')}`} right={<span className="text-[10px] normal-case tracking-normal" style={{ color: FAINT }}>{isToday ? `média ${teamAvg} · clique p/ ver os chamados` : `criados no dia · média ${teamAvg}`}</span>} className="min-h-0">
          {teamLoad && <div className="h-40 rounded-lg animate-pulse" style={{ background: `${BORDER}66` }} />}
          {!teamLoad && workload.length === 0 && <p className="text-xs py-8 text-center" style={{ color: FAINT }}>Sem tickets ativos.</p>}
          <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
            {workload.map(a => {
              const col = loadColor(a.active)
              return (
                <button key={a.owner} onClick={isToday ? () => setDrawer({ type: 'analyst', owner: a.owner, label: a.name }) : undefined} disabled={!isToday}
                  className={`relative flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left transition-colors group ${isToday ? 'hover:bg-[#1a2233] cursor-pointer' : 'cursor-default'}`} style={{ borderBottom: `1px solid ${BORDER}55` }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col }} />
                  <span className="flex-1 min-w-0 truncate text-[13px]" style={{ color: INK }}>{a.name}{a.active > teamAvg * 1.6 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ color: C.crit, background: `${C.crit}1f` }}>sobrecarga</span>}</span>
                  <div className="w-24 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: BORDER }}><div className="h-full rounded-full" style={{ width: `${(a.active / maxLoad) * 100}%`, background: col }} /></div>
                  <span className="text-[15px] font-bold tabular-nums w-7 text-right shrink-0" style={{ color: col }}>{a.active}</span>
                  <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: FAINT }}>▸</span>
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Feed do dia + Alertas SLA */}
        <Panel title={`Feed do Dia · ${isToday ? 'hoje' : date.split('-').reverse().join('/')}`} right={<span className="text-[10px] normal-case tracking-normal" style={{ color: FAINT }}>{feedCount} criados</span>} className="min-h-0">
          {alerts.length > 0 && (
            <button onClick={() => setDrawer({ type: 'state', bucket: 'abertos', label: 'Abertos' })} className="mb-3 px-3 py-2 rounded-lg text-[12px] text-left" style={{ background: `${C.crit}14`, border: `1px solid ${C.crit}44`, color: C.crit }}>
              ⚠ <b>{alerts.length}</b> chamado(s) próximo(s) do vencimento de SLA
            </button>
          )}
          {feedLoad && <div className="h-40 rounded-lg animate-pulse" style={{ background: `${BORDER}66` }} />}
          {!feedLoad && feedTickets.length === 0 && <p className="text-xs py-8 text-center" style={{ color: FAINT }}>Nenhum chamado criado hoje ainda.</p>}
          <div className="flex flex-col overflow-y-auto pr-1">
            {feedTickets.map(t => (
              <div key={t.ticket_id ?? t.number} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}55` }}>
                <span className="text-[11px] tabular-nums shrink-0 mt-0.5 w-[52px]" style={{ color: FAINT }}>#{t.number}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] leading-snug truncate" style={{ color: INK }}>{t.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px]" style={{ color: MUTED }}>{t.owner ? `🔧 ${fullName(t.owner)}` : '· sem dono'}</span>
                    <span className="text-[11px]" style={{ color: FAINT }}>{t.group ? `· ${t.group}` : ''} {t.created_at ? `· ${fmtAgo(t.created_at)}` : ''}</span>
                  </div>
                </div>
                <span className="text-[10.5px] font-medium shrink-0 mt-0.5 whitespace-nowrap px-1.5 py-0.5 rounded" style={{ color: tstateColor(t.state), background: `${tstateColor(t.state)}18` }}>{t.state}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <p className="text-[10px] text-center pb-2" style={{ color: FAINT }}>Dados reais · GET /noc/queue · /metrics/team-status · /noc/today-feed · /noc/sla-alerts</p>

      {drawer && <OpDrawer ctx={drawer} onClose={() => setDrawer(null)} />}
    </div>
  )
}
