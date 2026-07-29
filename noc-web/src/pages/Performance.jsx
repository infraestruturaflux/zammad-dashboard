import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  getAnalystPerformance, getHistoryRange, getMTTAStats,
  getMTTRStats, getSLAStats, getVolumeByGroup, getVolumeStatusDetail,
} from '../api/client'
import { usePolling } from '../hooks/usePolling'

// ── Utilitários ───────────────────────────────────────────────────────────────

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
    m--; if (m === 0) { m = 12; y-- }
  }
  return result
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y}`
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fullName(owner) {
  if (!owner || owner === '-') return owner ?? '?'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local.split(/[.\s_-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

function trendPct(current, prev, lowerIsBetter = true) {
  if (!current || !prev || prev === 0) return null
  const pct = ((current - prev) / prev) * 100
  const improved = lowerIsBetter ? pct < 0 : pct > 0
  return { pct: Math.abs(pct).toFixed(1), improved, sign: pct < 0 ? '▼' : '▲' }
}

function Label({ children }) {
  return <h2 className="text-xs uppercase tracking-widest text-noc-muted">{children}</h2>
}

const MONTHS = monthsFrom('2026-01')
const TODAY  = todayISO()

const STATUS_META = {
  em_atendimento: { label: 'Em Atend.',     color: 'text-sky-400',     bg: 'bg-sky-500/20',     bar: '#38bdf8' },
  ag_cliente:     { label: 'Ag. Cliente',   color: 'text-amber-400',   bg: 'bg-amber-500/20',   bar: '#fbbf24' },
  ag_terceiros:   { label: 'Ag. Terceiros', color: 'text-orange-400',  bg: 'bg-orange-500/20',  bar: '#fb923c' },
  escalonado:     { label: 'Escalonado',    color: 'text-violet-400',  bg: 'bg-violet-500/20',  bar: '#a78bfa' },
  resolvido:      { label: 'Resolvido',     color: 'text-emerald-400', bg: 'bg-emerald-500/20', bar: '#34d399' },
  fechado:        { label: 'Fechado',       color: 'text-slate-400',   bg: 'bg-slate-500/20',   bar: '#64748b' },
  novo:           { label: 'Novo',          color: 'text-rose-400',    bg: 'bg-rose-500/20',    bar: '#f87171' },
  outros:         { label: 'Outros',        color: 'text-noc-muted',   bg: 'bg-white/5',        bar: '#475569' },
}

const STATE_COLOR_MAP = {
  'em atendimento': 'text-sky-400', 'aguardando cliente': 'text-amber-400',
  'aguardando terceiros': 'text-orange-400', 'escalonado dev': 'text-violet-400',
  'escalonado rotas': 'text-cyan-400', 'escalonado infra': 'text-rose-400',
  'resolvido': 'text-emerald-400', 'resolved': 'text-emerald-400',
  'closed': 'text-slate-400', 'fechado': 'text-slate-400', 'new': 'text-rose-400',
}
const stateColor = (s) => STATE_COLOR_MAP[(s || '').toLowerCase()] ?? 'text-white/60'

// ── 1. Tooltips de siglas ─────────────────────────────────────────────────────

const TOOLTIP_DEFS = {
  MTTR: 'Mean Time To Resolve — Tempo Médio de Resolução',
  MTTA: 'Mean Time To Assign — Tempo até 1ª Ação do Analista',
  P50:  'Percentil 50 (Mediana) — metade dos casos abaixo deste tempo',
  P90:  'Percentil 90 — 90% dos casos resolvidos abaixo deste tempo',
  FCR:  'First Contact Resolution — % resolvidos no 1º contato',
}

function Tip({ id, children }) {
  if (!TOOLTIP_DEFS[id]) return <>{children}</>
  return (
    <span className="relative inline-flex items-center gap-0.5 group/tip cursor-default">
      {children}
      <span className="text-noc-muted/40 text-[9px] leading-none group-hover/tip:text-sky-400 transition-colors">ⓘ</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        px-2.5 py-1.5 rounded-lg z-50 whitespace-nowrap
        bg-noc-bg border border-noc-border/80 text-white text-[11px] shadow-[0_4px_20px_rgba(0,0,0,0.6)]
        opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100
        transition-all duration-150 ease-out">
        <span className="text-sky-400 font-semibold">{id}</span>
        {' — '}
        {TOOLTIP_DEFS[id].split(' — ')[1]}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px
          border-4 border-transparent border-t-noc-border/80" />
      </span>
    </span>
  )
}

// ── 2. Glossário ─────────────────────────────────────────────────────────────

const GLOSSARY_ITEMS = [
  {
    term: 'MTTR',
    full: 'Mean Time To Resolve',
    measures: 'Abertura → Fechamento',
    desc: 'Tempo médio desde a abertura do chamado até o fechamento definitivo. Considera todos os chamados FECHADOS no período (cada um contribui com seu próprio tempo). Chamados ainda abertos não entram. Quanto menor, melhor.',
    color: 'text-sky-400',
  },
  {
    term: 'P50 — Mediana',
    full: 'Percentil 50',
    measures: 'Posição central da lista de tempos',
    desc: 'Ordenamos os tempos de resolução do menor ao maior; o P50 é o valor no meio. 50% dos chamados são resolvidos neste tempo ou menos. É melhor que a média porque um chamado esquecido de 80h não distorce o número — mostra o tempo TÍPICO real.',
    color: 'text-sky-300',
  },
  {
    term: 'P90',
    full: 'Percentil 90',
    measures: 'Posição 90% da lista de tempos',
    desc: '90% dos chamados são resolvidos neste tempo ou menos; só os 10% mais demorados ficam acima. Indica o "pior caso frequente" — útil para definir expectativas de prazo com clientes sem contar os outliers extremos.',
    color: 'text-orange-400',
  },
  {
    term: 'MTTA',
    full: 'Mean Time To Assign',
    measures: 'Abertura → 1ª ação do analista',
    desc: 'Tempo médio que o chamado fica parado na FILA até alguém pegar (triagem, atribuição ou primeira resposta). Não importa quando foi resolvido — só quando a equipe reagiu pela 1ª vez. Mede a agilidade de reação.',
    color: 'text-emerald-400',
  },
  {
    term: 'FCR',
    full: 'First Contact Resolution',
    measures: '% resolvidos sem reabertura',
    desc: '% de chamados resolvidos no primeiro contato, sem que o ticket precise ser reaberto. Alta taxa de FCR indica qualidade de atendimento e reduz o esforço do cliente.',
    color: 'text-violet-400',
  },
  {
    term: 'Horas Úteis',
    full: 'Business Hours',
    measures: 'Só 08h–19h, seg–sex',
    desc: 'Tempo contabilizado apenas dentro do expediente (08h–19h, segunda a sexta). Exclui fins de semana e madrugadas — representa o esforço real da equipe.',
    color: 'text-amber-400',
  },
  {
    term: 'Horas Corridas',
    full: 'Wall-Clock Hours',
    measures: 'Relógio 24h, todos os dias',
    desc: 'Tempo total de relógio desde abertura até fechamento, incluindo fins de semana e fora do expediente. Útil para medir a percepção de tempo do cliente.',
    color: 'text-slate-400',
  },
]

// Diagrama visual da linha do tempo de um chamado
function TimelineDiagram() {
  return (
    <div className="bg-noc-bg/40 border border-noc-border/50 rounded-lg p-4 flex flex-col gap-3">
      <p className="text-[11px] text-slate-300 font-medium">
        Os dois "relógios" de um chamado:
      </p>

      {/* Régua com os 3 marcos */}
      <div className="relative">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
          <span className="flex flex-col items-start">
            <span className="w-2 h-2 rounded-full bg-rose-400 mb-0.5" />
            Abertura
          </span>
          <span className="flex flex-col items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-400 mb-0.5" />
            1ª ação
          </span>
          <span className="flex flex-col items-end">
            <span className="w-2 h-2 rounded-full bg-sky-400 mb-0.5" />
            Fechamento
          </span>
        </div>
        {/* Linha base */}
        <div className="h-px bg-noc-border w-full mb-2" />

        {/* Barra MTTA (abertura → 1ª ação) — ~35% */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-1.5 rounded-full bg-emerald-500/60" style={{ width: '35%' }} />
          <span className="text-[10px] text-emerald-400 font-medium">MTTA — fila / reação</span>
        </div>

        {/* Barra MTTR (abertura → fechamento) — 100% */}
        <div className="flex items-center gap-2">
          <div className="h-1.5 rounded-full bg-sky-500/60 w-full max-w-[70%]" />
          <span className="text-[10px] text-sky-400 font-medium">MTTR — resolução total</span>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        <strong className="text-emerald-400">MTTA baixo + MTTR alto</strong> = pega rápido mas demora a resolver.
        <br />
        <strong className="text-amber-400">MTTA alto + MTTR baixo</strong> = fica parado na fila, falta gente na triagem.
      </p>
    </div>
  )
}

// Ilustração de como P50 e P90 são lidos — fila ordenada de tempos
function PercentileDiagram() {
  // 10 chamados de exemplo, ordenados do mais rápido ao mais lento
  const times = [
    { h: '1h',  pos: 1 },  { h: '2h',  pos: 2 },  { h: '3h',  pos: 3 },
    { h: '4h',  pos: 4 },  { h: '5h',  pos: 5 },  { h: '6h',  pos: 6 },
    { h: '9h',  pos: 7 },  { h: '14h', pos: 8 },  { h: '22h', pos: 9 },
    { h: '80h', pos: 10 },
  ]
  return (
    <div className="bg-noc-bg/40 border border-noc-border/50 rounded-lg p-4 flex flex-col gap-3">
      <p className="text-[11px] text-slate-300 font-medium">
        Como ler P50 e P90 — exemplo com 10 chamados resolvidos:
      </p>

      <p className="text-[10px] text-slate-400">
        Ordenamos os tempos de resolução do mais rápido ao mais lento →
      </p>

      {/* Fila de tempos */}
      <div className="flex items-end gap-1">
        {times.map((t) => {
          const isP50 = t.pos === 5
          const isP90 = t.pos === 9
          const color = isP50 ? 'bg-sky-500/30 border-sky-400 text-sky-300'
                      : isP90 ? 'bg-orange-500/30 border-orange-400 text-orange-300'
                      : 'bg-white/5 border-noc-border text-slate-400'
          return (
            <div key={t.pos} className="flex flex-col items-center gap-1 flex-1">
              <div className={`w-full text-center py-1.5 rounded border text-[10px] font-bold tabular-nums ${color}`}>
                {t.h}
              </div>
              {(isP50 || isP90) && (
                <span className={`text-[9px] font-bold leading-none ${isP50 ? 'text-sky-400' : 'text-orange-400'}`}>
                  ▲
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legendas */}
      <div className="flex flex-col gap-1.5 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-sky-500/30 border border-sky-400 shrink-0" />
          <span className="text-slate-300">
            <strong className="text-sky-400">P50 = 5h</strong> → metade dos chamados resolve em <strong>5h ou menos</strong> (a posição do meio da fila)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-orange-500/30 border border-orange-400 shrink-0" />
          <span className="text-slate-300">
            <strong className="text-orange-400">P90 = 22h</strong> → 90% resolve em <strong>22h ou menos</strong>; só os 10% mais lentos ficam acima
          </span>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed border-t border-noc-border/50 pt-2">
        💡 Repare no chamado de <strong className="text-rose-400">80h</strong> (cliente sumiu).
        A <strong>média</strong> seria 14,6h — distorcida por ele.
        O <strong className="text-sky-400">P50 (5h)</strong> mostra o tempo real do dia a dia, ignorando esse extremo.
      </p>
    </div>
  )
}

function GlossaryButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Glossário — o que significa cada métrica?"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs
          text-noc-muted hover:text-white hover:bg-white/5
          border border-noc-border/50 hover:border-noc-border
          transition-all duration-150">
        <span className="text-sm font-bold leading-none">?</span>
        <span className="hidden sm:inline">Glossário</span>
      </button>

      {open && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Drawer lateral */}
          <div className="fixed right-0 top-0 h-full w-full max-w-md z-50
                          bg-noc-surface border-l border-noc-border flex flex-col shadow-2xl">

            <div className="flex items-center justify-between px-5 py-4 border-b border-noc-border shrink-0">
              <div>
                <h2 className="text-sm font-bold text-white">Glossário da Operação</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  O que significa cada métrica do painel
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-noc-muted hover:text-white text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {/* Diagrama da linha do tempo */}
              <TimelineDiagram />

              {/* Ilustração de percentis */}
              <PercentileDiagram />

              {GLOSSARY_ITEMS.map((item) => (
                <div key={item.term} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-sm font-bold ${item.color}`}>{item.term}</span>
                    <span className="text-[11px] text-slate-400">— {item.full}</span>
                  </div>
                  {item.measures && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 w-fit
                      bg-white/5 border border-noc-border/50 rounded px-1.5 py-0.5">
                      ⏱ mede: <strong className="text-slate-300">{item.measures}</strong>
                    </span>
                  )}
                  <p className="text-xs text-slate-300 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-noc-border shrink-0">
              <p className="text-[10px] text-noc-muted">
                Clique fora para fechar · {GLOSSARY_ITEMS.length} termos explicados
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── 3. Seletor de período ─────────────────────────────────────────────────────

function PeriodSelector({ mode, month, customStart, customEnd, onMonth, onCustom }) {
  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      <div className="flex gap-1 flex-wrap">
        {MONTHS.map((m) => (
          <button key={m} onClick={() => onMonth(m)}
            className={`px-2 py-0.5 rounded text-xs transition-colors
              ${mode === 'month' && month === m ? 'bg-sky-500/20 text-sky-400' : 'text-noc-muted hover:text-white'}`}>
            {fmtMonth(m)}
          </button>
        ))}
      </div>
      <span className="text-noc-border text-xs hidden sm:inline">|</span>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-noc-muted shrink-0">De</span>
        <input type="date" value={customStart} max={customEnd || TODAY}
          onChange={e => onCustom(e.target.value, customEnd)}
          className="px-2 py-0.5 rounded bg-noc-surface border border-noc-border text-noc-muted
            [color-scheme:dark] cursor-pointer focus:outline-none focus:text-white focus:border-sky-500 w-32" />
        <span className="text-noc-muted shrink-0">Até</span>
        <input type="date" value={customEnd} min={customStart} max={TODAY}
          onChange={e => onCustom(customStart, e.target.value)}
          className="px-2 py-0.5 rounded bg-noc-surface border border-noc-border text-noc-muted
            [color-scheme:dark] cursor-pointer focus:outline-none focus:text-white focus:border-sky-500 w-32" />
        {mode === 'custom' && <span className="text-sky-400 text-[10px] font-medium">● personalizado</span>}
      </div>
    </div>
  )
}

// ── 3. Modal de histórico (mini-gráfico) ──────────────────────────────────────

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-noc-surface border border-noc-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-noc-muted mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold tabular-nums text-white">
            {p.value != null ? `${p.value}${p.unit ?? ''}` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

// Subtrai N dias de hoje → 'YYYY-MM-DD'
function daysAgoISO(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Presets de intervalo de datas — independentes do filtro global da página
const HIST_PRESETS = [
  { label: 'Últ. 7 dias',   start: () => daysAgoISO(6),   end: () => TODAY },
  { label: 'Últ. 30 dias',  start: () => daysAgoISO(29),  end: () => TODAY },
  { label: 'Últ. 90 dias',  start: () => daysAgoISO(89),  end: () => TODAY },
  { label: 'Últ. 12 meses', start: () => daysAgoISO(364), end: () => TODAY },
]

// Metadados por métrica do modal de histórico
const HIST_META = {
  mttr:   { title: 'Histórico MTTR',   desc: 'Tempo médio de resolução em horas úteis (média + P90)', kind: 'hours' },
  mtta:   { title: 'Histórico MTTA',   desc: 'Tempo médio até a 1ª ação do analista (horas úteis)',    kind: 'hours' },
  sla:    { title: 'Histórico SLA',    desc: '% de chamados resolvidos dentro do prazo contratado',     kind: 'pct'   },
  volume: { title: 'Evolução de Volume', desc: 'Chamados criados vs. fechados ao longo do período',     kind: 'volume'},
}

function HistoryModal({ metric, onClose }) {
  const meta = HIST_META[metric] ?? HIST_META.mttr
  // Filtro próprio do modal — começa com últimos 90 dias
  const [start, setStart] = useState(daysAgoISO(89))
  const [end,   setEnd]   = useState(TODAY)

  const fetchFn = useCallback(() => getHistoryRange(metric, start, end), [metric, start, end])
  const { data, loading } = usePolling(fetchFn, 0)
  const points = data?.points ?? []

  const applyPreset = (p) => { setStart(p.start()); setEnd(p.end()) }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-noc-surface border border-noc-border rounded-xl shadow-2xl w-full max-w-3xl flex flex-col gap-4 p-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-white">{meta.title}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{meta.desc}</p>
            </div>
            <button onClick={onClose} className="text-noc-muted hover:text-white text-xl">✕</button>
          </div>

          {/* Filtro de período próprio do modal: presets + De/Até */}
          <div className="flex items-center gap-3 flex-wrap bg-noc-bg/40 rounded-lg p-2 border border-noc-border/50">
            <div className="flex gap-0.5 bg-noc-border/40 rounded-lg p-0.5">
              {HIST_PRESETS.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className={`px-2 py-0.5 rounded-md text-xs transition-all
                    ${start === p.start() && end === p.end()
                      ? 'bg-sky-500/20 text-sky-400 font-medium'
                      : 'text-noc-muted hover:text-white'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <span className="text-noc-border text-xs hidden sm:inline">|</span>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400">De</span>
              <input type="date" value={start} max={end}
                onChange={e => setStart(e.target.value)}
                className="px-2 py-0.5 rounded bg-noc-surface border border-noc-border text-slate-300
                  [color-scheme:dark] cursor-pointer focus:outline-none focus:text-white focus:border-sky-500 w-32" />
              <span className="text-slate-400">Até</span>
              <input type="date" value={end} min={start} max={TODAY}
                onChange={e => setEnd(e.target.value)}
                className="px-2 py-0.5 rounded bg-noc-surface border border-noc-border text-slate-300
                  [color-scheme:dark] cursor-pointer focus:outline-none focus:text-white focus:border-sky-500 w-32" />
            </div>
            {data?.granularity && (
              <span className="text-[10px] text-slate-400 ml-auto">
                agrupamento: <strong className="text-sky-400">{data.granularity}</strong>
              </span>
            )}
          </div>

          {/* Gráfico */}
          {loading
            ? <div className="h-60 bg-noc-border/30 rounded-lg animate-pulse" />
            : points.length === 0
              ? <p className="text-sm text-noc-muted text-center py-16">Sem dados no período selecionado.</p>
              : (
                <ResponsiveContainer width="100%" height={260}>
                  {meta.kind === 'hours' ? (
                    <LineChart data={points} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3042" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="h" />
                      <Tooltip content={<DarkTooltip />} />
                      <Line type="monotone" dataKey="biz_mean_h"  name="Média (úteis)"    stroke="#38bdf8" strokeWidth={2}   dot={{ r: 3 }} unit="h" />
                      <Line type="monotone" dataKey="biz_p90_h"   name="P90 (úteis)"      stroke="#fb923c" strokeWidth={2}   strokeDasharray="5 3" dot={false} unit="h" />
                      <Line type="monotone" dataKey="wall_mean_h" name="Média (corridas)" stroke="#475569" strokeWidth={1.5} strokeDasharray="3 3" dot={false} unit="h" />
                    </LineChart>
                  ) : meta.kind === 'pct' ? (
                    <LineChart data={points} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3042" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis domain={[70, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                      <Tooltip content={<DarkTooltip />} />
                      <ReferenceLine y={95} stroke="#34d399" strokeDasharray="4 2" label={{ value: 'meta 95%', fill: '#34d399', fontSize: 10 }} />
                      <ReferenceLine y={85} stroke="#fbbf24" strokeDasharray="4 2" label={{ value: 'mín 85%',  fill: '#fbbf24', fontSize: 10 }} />
                      <Line type="monotone" dataKey="sla_pct" name="SLA" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 4 }} unit="%" />
                    </LineChart>
                  ) : (
                    <LineChart data={points} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3042" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip content={<DarkTooltip />} />
                      <Line type="monotone" dataKey="criados"  name="Criados"  stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="fechados" name="Fechados" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              )
          }

          <p className="text-[10px] text-slate-400">
            ℹ Este gráfico usa seu próprio filtro de período — não altera o filtro principal do dashboard.
          </p>
        </div>
      </div>
    </>
  )
}

// ── 4. KPI Card com legendas fixas + clicável ─────────────────────────────────

function TrendBadge({ trend }) {
  if (!trend) return null
  return (
    <span className={`text-[11px] font-semibold tabular-nums ${trend.improved ? 'text-emerald-400' : 'text-rose-400'}`}>
      {trend.sign} {trend.pct}% vs anterior
    </span>
  )
}

function KPICard({ title, subtitle, tipId, bizFmt, wallFmt, count, trend, loading, onClick }) {
  const clickable = !!onClick
  return (
    <div onClick={onClick}
      className={`noc-card flex flex-col gap-1.5 transition-all duration-200
        ${clickable ? 'cursor-pointer hover:ring-1 hover:ring-sky-500/40 hover:shadow-[0_0_12px_rgba(56,189,248,0.15)]' : ''}`}>

      {/* Título com tooltip */}
      <div>
        <p className="text-[11px] text-noc-muted uppercase tracking-wider leading-tight">
          {tipId ? <Tip id={tipId}>{title}</Tip> : title}
          {clickable && <span className="ml-1 text-noc-muted/30 text-[9px]">↗</span>}
        </p>
        {/* ── Legenda fixa — sempre visível ── */}
        {subtitle && (
          <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{subtitle}</p>
        )}
      </div>

      {loading
        ? <div className="h-8 bg-noc-border rounded animate-pulse" />
        : count === 0
          ? <p className="text-sm text-noc-muted">Sem dados</p>
          : <>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white tabular-nums leading-none">{bizFmt ?? '—'}</span>
                <span className="text-[11px] text-noc-muted">úteis</span>
              </div>
              <p className="text-[11px] text-noc-muted/70 tabular-nums">{wallFmt} corridas · {count} tics</p>
              <TrendBadge trend={trend} />
            </>
      }
    </div>
  )
}

function SLACard({ data, loading, onClick }) {
  const pct   = data?.sla_pct ?? null
  const prev  = data?.prev_sla_pct ?? null
  const trend = trendPct(pct, prev, false)
  const color = pct === null ? '' : pct >= 95 ? 'text-emerald-400' : pct >= 85 ? 'text-amber-400' : 'text-rose-400'
  const glow  = pct !== null && pct < 85  ? 'shadow-[0_0_18px_rgba(239,68,68,0.25)]'
              : pct !== null && pct >= 95  ? 'shadow-[0_0_18px_rgba(52,211,153,0.2)]' : ''

  return (
    <div onClick={onClick}
      className={`noc-card flex flex-col gap-1.5 transition-all duration-500 ${glow}
        ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-sky-500/40' : ''}`}>
      <div>
        <p className="text-[11px] text-noc-muted uppercase tracking-wider"><Tip id="SLA">SLA Cumprido</Tip>
          {onClick && <span className="ml-1 text-noc-muted/30 text-[9px]">↗</span>}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">% dentro do prazo contratado</p>
      </div>
      {loading
        ? <div className="h-8 bg-noc-border rounded animate-pulse" />
        : pct === null
          ? <p className="text-sm text-noc-muted">Sem dados</p>
          : <>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{pct.toFixed(1)}%</span>
                <span className="text-[11px] text-noc-muted">{data.met}/{data.count}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: pct >= 95 ? '#34d399' : pct >= 85 ? '#fbbf24' : '#f87171' }} />
              </div>
              <TrendBadge trend={trend} />
            </>
      }
    </div>
  )
}

// ── 5. Drawer de tickets com solicitante ──────────────────────────────────────

function StatusDrilldown({ group, statusKey, month, startDate, endDate, onClose }) {
  const fetchFn = useCallback(
    () => getVolumeStatusDetail(group, statusKey, month, startDate, endDate),
    [group, statusKey, month, startDate, endDate]
  )
  const { data, loading } = usePolling(fetchFn, 0)
  const tickets = data?.tickets ?? []
  const meta = STATUS_META[statusKey] ?? STATUS_META.outros

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg z-50
                      bg-noc-surface border-l border-noc-border flex flex-col shadow-2xl">

        <div className="flex items-center justify-between px-5 py-4 border-b border-noc-border shrink-0">
          <div>
            {group && <p className="text-[11px] text-noc-muted mb-0.5">{group}</p>}
            <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
            <p className="text-sm text-white mt-0.5">{loading ? '…' : `${data?.total ?? 0} chamados`}</p>
          </div>
          <button onClick={onClose} className="text-noc-muted hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-0.5">
          {loading && <div className="h-8 bg-noc-border rounded animate-pulse" />}
          {!loading && tickets.length === 0 && (
            <p className="text-xs text-noc-muted py-6 text-center">Nenhum chamado neste status.</p>
          )}
          {tickets.map((t) => (
            <div key={t.number} className="flex items-start gap-2 py-2 border-b border-noc-border/25 text-xs">
              <span className="text-noc-muted tabular-nums shrink-0 w-14 mt-0.5">#{t.number}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white/90 leading-snug">{t.title}</p>
                {/* ── Solicitante + Analista ── */}
                <div className="flex gap-3 mt-0.5 flex-wrap">
                  {t.customer && (
                    <span className="text-noc-muted/70 text-[10px]">
                      👤 {t.customer}
                    </span>
                  )}
                  {t.owner && (
                    <span className="text-noc-muted/70 text-[10px]">
                      🔧 {fullName(t.owner)}
                    </span>
                  )}
                </div>
              </div>
              <span className={`shrink-0 mt-0.5 whitespace-nowrap ${stateColor(t.state)}`}>{t.state}</span>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-noc-border shrink-0">
          <p className="text-[10px] text-noc-muted">
            {data?.total ?? 0} chamados · <strong>{meta.label}</strong>
            {group ? ` · ${group}` : ''} · clique fora para fechar
          </p>
        </div>
      </div>
    </>
  )
}

// ── 6. Seção de Grupos (estado do drill-down elevado para cá) ────────────────

function GroupCard({ group, onChipClick }) {
  const entries = Object.entries(group.by_state).sort((a, b) => b[1] - a[1])
  return (
    <div className="noc-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-500/70 shrink-0" />
          <span className="text-sm font-semibold text-white truncate">{group.name}</span>
        </div>
        <span className="text-xs font-bold tabular-nums text-white bg-white/5 px-2 py-0.5 rounded-full">
          {group.total}
        </span>
      </div>

      {/* Chips count + % */}
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([key, n]) => {
          const meta = STATUS_META[key] ?? STATUS_META.outros
          const pct  = Math.round((n / group.total) * 100)
          return (
            <button key={key} onClick={() => onChipClick(group.name, key)}
              className={`group/chip flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                transition-all hover:scale-[1.04] hover:ring-1 hover:ring-white/15 cursor-pointer ${meta.bg}`}>
              <span className={`text-sm font-bold tabular-nums leading-none ${meta.color}`}>{n}</span>
              <div className="flex flex-col leading-none">
                <span className={`text-[10px] font-semibold tabular-nums ${meta.color}/80`}>{pct}%</span>
                <span className="text-[10px] text-noc-muted">{meta.label}</span>
              </div>
              <span className="text-noc-muted/30 text-[10px] group-hover/chip:text-noc-muted/70 transition-colors">▸</span>
            </button>
          )
        })}
      </div>

      {/* Barra proporcional */}
      <div className="flex h-1 rounded-full overflow-hidden gap-px">
        {entries.map(([key, n]) => {
          const meta = STATUS_META[key] ?? STATUS_META.outros
          return (
            <div key={key} title={`${meta.label}: ${n}`}
              className="h-full"
              style={{ width: `${(n / group.total) * 100}%`, backgroundColor: meta.bar }} />
          )
        })}
      </div>
    </div>
  )
}

function GroupsSection({ data, loading, month, startDate, endDate, onShowHistory }) {
  const [search, setSearch] = useState('')
  // drill: { groupName, statusKey } — estado gerenciado AQUI, não dentro do GroupCard
  const [drill, setDrill]   = useState(null)

  const groups = (data?.groups ?? []).filter(g =>
    !search.trim() || g.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Label>Volume por Grupo · {data?.groups?.length ?? 0} grupos ativos</Label>
            <button onClick={onShowHistory}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px]
                text-sky-400 hover:bg-sky-500/10 transition-colors">
              📈 Evolução
            </button>
          </div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar grupo…"
            className="px-3 py-1 rounded text-xs bg-noc-surface border border-noc-border
              text-noc-muted placeholder:text-noc-muted/50 focus:outline-none
              focus:border-sky-500 focus:text-white w-40" />
        </div>

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="noc-card h-28 bg-noc-border/30 animate-pulse" />)}
          </div>
        )}

        {!loading && groups.length === 0 && (
          <p className="text-xs text-noc-muted py-4 text-center">
            {search ? `Nenhum grupo para "${search}".` : 'Sem dados para o período.'}
          </p>
        )}

        {!loading && groups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {groups.map(g => (
              <GroupCard
                key={g.name} group={g}
                onChipClick={(groupName, statusKey) => setDrill({ groupName, statusKey })}
              />
            ))}
          </div>
        )}

        {!loading && groups.length > 0 && (
          <p className="text-[10px] text-noc-muted text-right">
            ▸ Clique num status para listar os chamados · grupos ordenados por volume
          </p>
        )}
      </div>

      {/* Drawer renderizado FORA do grid */}
      {drill && (
        <StatusDrilldown
          group={drill.groupName}
          statusKey={drill.statusKey}
          month={month}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  )
}

// ── 7. Tabela analistas com toggle Úteis / Corridas ───────────────────────────

const ANALYST_BLOCKLIST = new Set(['Gabriel Maciel', 'Joao Guimaraes'])

function ProgressBar({ value }) {
  if (value === null || value === undefined) return <span className="text-noc-border">·</span>
  const col = value >= 70 ? '#34d399' : value >= 40 ? '#fbbf24' : '#f87171'
  return (
    <div className="flex items-center gap-2 justify-end min-w-[80px]">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden max-w-[56px]">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: col }} />
      </div>
      <span className="tabular-nums text-[11px] shrink-0" style={{ color: col }}>{value}%</span>
    </div>
  )
}

function FCRBadge({ value }) {
  if (value == null) return <span className="text-noc-border">·</span>
  const col = value >= 80 ? 'text-emerald-400' : value >= 65 ? 'text-amber-400' : 'text-rose-400'
  return <span className={`font-semibold tabular-nums ${col}`}>{value}%</span>
}

function AnalystPerformanceTable({ month, startDate, endDate, onShowHistory, mode, setMode, onAnalystsChange }) {
  const fetchFn = useCallback(
    () => getAnalystPerformance(month, startDate, endDate),
    [month, startDate, endDate]
  )
  const { data, loading } = usePolling(fetchFn, 5 * 60_000)
  const analysts = (data?.analysts ?? []).filter(a => !ANALYST_BLOCKLIST.has(fullName(a.owner)))

  // Reporta os analistas filtrados para a página (usado na exportação)
  useEffect(() => { onAnalystsChange?.(analysts) }, [data])  // eslint-disable-line

  // Seleciona campos conforme o modo
  const get = (a, field) => mode === 'biz'
    ? { val: a[`${field}_biz_h`], fmt: a[`${field}_fmt`] ?? a[`${field}_biz_fmt`] }
    : { val: a[`${field}_wall_h`], fmt: a[`${field}_wall_fmt`] }

  return (
    <div className="noc-card flex flex-col gap-3">
      {/* Header com toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Label>Desempenho por Analista</Label>
          <button onClick={onShowHistory}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px]
              text-sky-400 hover:bg-sky-500/10 transition-colors">
            📈 Evolução
          </button>
        </div>
        <div className="flex items-center gap-1 bg-noc-border/50 rounded-lg p-0.5">
          {[['biz', 'Horas Úteis'], ['wall', 'Horas Corridas']].map(([val, lbl]) => (
            <button key={val} onClick={() => setMode(val)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all
                ${mode === val
                  ? 'bg-sky-500/20 text-sky-400 shadow-sm'
                  : 'text-noc-muted hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="h-32 bg-noc-border rounded animate-pulse" />}

      {!loading && analysts.length === 0 && (
        <p className="text-xs text-noc-muted py-2">
          Sem dados — histórico de eventos indisponível para este período.
        </p>
      )}

      {!loading && analysts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-noc-border text-[11px]">
                <th className="text-left py-2 pr-3 text-noc-muted font-medium">Analista</th>
                <th className="text-center py-2 px-2 text-sky-400 font-medium">Tickets</th>
                <th className="text-center py-2 px-2 text-emerald-400 font-medium">
                  Ativo
                  <span className="block font-normal text-slate-400 text-[10px]">c/ analista</span>
                </th>
                <th className="text-center py-2 px-2 text-amber-400 font-medium">
                  Ag. Cliente
                  <span className="block font-normal text-slate-400 text-[10px]">esperando cliente</span>
                </th>
                <th className="text-center py-2 px-2 text-orange-400 font-medium">
                  Ag. Terceiros
                  <span className="block font-normal text-slate-400 text-[10px]">fornecedor / 3ºs</span>
                </th>
                <th className="text-center py-2 px-2 text-violet-400 font-medium">
                  <Tip id="FCR">FCR</Tip>
                  <span className="block font-normal text-slate-400 text-[10px]">Resolução 1º Contato</span>
                </th>
                <th className="text-right py-2 pl-2 text-noc-muted font-medium">
                  % Ativo
                  <span className="block font-normal text-slate-400 text-[10px]">do total</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {analysts.map((a, i) => {
                const act = get(a, 'active')
                const cli = get(a, 'ag_cliente')
                const ter = get(a, 'ag_terceiros')
                const total  = (act.val ?? 0) + (cli.val ?? 0) + (ter.val ?? 0)
                const pctAct = total > 0 ? Math.round(((act.val ?? 0) / total) * 100) : null
                return (
                  <tr key={a.owner}
                    className={`border-b border-noc-border/25 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="py-2 pr-3 font-medium text-white whitespace-nowrap">{fullName(a.owner)}</td>
                    <td className="text-center py-2 px-2 tabular-nums text-sky-400 font-bold">{a.tickets_count}</td>
                    <td className="text-center py-2 px-2 tabular-nums text-emerald-400">
                      {(act.val ?? 0) > 0 ? act.fmt : <span className="text-noc-border">·</span>}
                    </td>
                    <td className="text-center py-2 px-2 tabular-nums text-amber-400">
                      {(cli.val ?? 0) > 0 ? cli.fmt : <span className="text-noc-border">·</span>}
                    </td>
                    <td className="text-center py-2 px-2 tabular-nums text-orange-400">
                      {(ter.val ?? 0) > 0 ? ter.fmt : <span className="text-noc-border">·</span>}
                    </td>
                    <td className="text-center py-2 px-2">
                      <FCRBadge value={a.fcr_pct ?? null} />
                    </td>
                    <td className="py-2 pl-2">
                      <ProgressBar value={pctAct} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && analysts.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-noc-border/50 pt-3">
          <p className="text-[11px] text-slate-300 font-medium">O que significa cada coluna:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 text-[10px] text-slate-400 leading-relaxed">
            <p>
              <strong className="text-sky-400">Tickets</strong> — quantidade de chamados distintos que o analista atendeu no período.
            </p>
            <p>
              <strong className="text-emerald-400">Ativo</strong> — tempo com o chamado <strong>em atendimento</strong>,
              de fato trabalhando nele (estado "Em Atendimento" enquanto era o dono).
            </p>
            <p>
              <strong className="text-amber-400">Ag. Cliente</strong> — tempo em que o chamado ficou
              <strong> parado esperando o cliente</strong> responder ou enviar alguma informação.
              Não é esforço do analista — o ticket está bloqueado aguardando o cliente.
            </p>
            <p>
              <strong className="text-orange-400">Ag. Terceiros</strong> — tempo
              <strong> parado esperando um terceiro</strong> (fornecedor, operadora, outra empresa).
              Também não é esforço do analista — depende de alguém externo à equipe.
            </p>
            <p>
              <strong className="text-violet-400">FCR — Resolução no 1º Contato</strong> — % de chamados que o analista
              <strong> resolveu de primeira</strong>, sem o ticket reabrir ou ficar indo e voltando. Quanto maior, melhor.
            </p>
            <p>
              <strong className="text-noc-muted">% Ativo</strong> — proporção do tempo <em>ativo</em> sobre o total
              (ativo + espera). Indica quanto do tempo foi trabalho real vs. espera externa.
            </p>
            <p>
              <strong className="text-noc-muted">Úteis vs. Corridas</strong> — <em>Horas Úteis</em> contam só o expediente
              (08h–19h seg–sex); <em>Horas Corridas</em> contam o relógio 24h, incluindo fins de semana.
            </p>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Exibindo agora: <strong className="text-sky-400">
              {mode === 'biz' ? 'Horas Úteis (08h–19h seg–sex)' : 'Horas Corridas (24h)'}
            </strong>
          </p>
        </div>
      )}
    </div>
  )
}

// ── Menu de exportação (Excel / PDF) ──────────────────────────────────────────

function ExportMenu({ getData, periodLabel }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function run(fmt) {
    setBusy(true); setOpen(false)
    try {
      const data = getData()
      const { exportToExcel, exportToPDF } = await import('../utils/exportPerformance')
      if (fmt === 'xlsx') exportToExcel(data, periodLabel)
      else exportToPDF(data, periodLabel)
    } catch (err) {
      console.error('[export]', err)
      alert('Não foi possível gerar o arquivo. Veja o console para detalhes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs
          bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 border border-sky-500/30
          transition-all disabled:opacity-50">
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
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Performance() {
  const [mode,        setMode]        = useState('month')
  const [month,       setMonth]       = useState(currentMonthISO())
  const [customStart, setCustomStart] = useState('')
  const [customEnd,   setCustomEnd]   = useState('')
  const [histModal,   setHistModal]   = useState(null)   // null | 'mttr' | 'sla'

  // Estado elevado para exportação
  const [analysts,    setAnalysts]    = useState([])
  const [analystMode, setAnalystMode] = useState('biz')  // 'biz' | 'wall'

  const apiMonth = mode === 'month' ? month       : null
  const apiStart = mode === 'custom' ? customStart : null
  const apiEnd   = mode === 'custom' ? customEnd   : null

  function handleMonth(m)    { setMode('month');  setMonth(m) }
  function handleCustom(s,e) { setCustomStart(s); setCustomEnd(e); if (s && e) setMode('custom') }

  // Dados do período
  const mttrFn   = useCallback(() => getMTTRStats(apiMonth, apiStart, apiEnd), [apiMonth, apiStart, apiEnd])
  const mttaFn   = useCallback(() => getMTTAStats(apiMonth, apiStart, apiEnd), [apiMonth, apiStart, apiEnd])
  const groupsFn = useCallback(() => getVolumeByGroup(apiMonth, apiStart, apiEnd), [apiMonth, apiStart, apiEnd])

  const { data: mttr,   loading: mttrLoad   } = usePolling(mttrFn,   5 * 60_000)
  const { data: mtta,   loading: mttaLoad   } = usePolling(mttaFn,   5 * 60_000)
  const { data: groups, loading: groupsLoad } = usePolling(groupsFn, 5 * 60_000)

  const mttrTrend = trendPct(mttr?.biz_mean_h, mttr?.prev_biz_mean_h, true)
  const p50Trend  = trendPct(mttr?.biz_p50_h,  mttr?.prev_biz_p50_h,  true)
  const p90Trend  = trendPct(mttr?.biz_p90_h,  mttr?.prev_biz_p90_h,  true)
  const mttaTrend = trendPct(mtta?.biz_mean_h, mtta?.prev_biz_mean_h, true)

  return (
    <div className="flex flex-col gap-5">

      {/* Cabeçalho + período */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm font-bold text-white">Desempenho Operacional</h1>
            {mode === 'custom' && customStart && customEnd && (
              <p className="text-[10px] text-sky-400/80 mt-0.5">Período: {customStart} → {customEnd}</p>
            )}
          </div>
          <GlossaryButton />
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <PeriodSelector mode={mode} month={month} customStart={customStart} customEnd={customEnd}
            onMonth={handleMonth} onCustom={handleCustom} />
          <ExportMenu
            periodLabel={mode === 'custom' && customStart && customEnd
              ? `${customStart}_a_${customEnd}` : fmtMonth(month)}
            getData={() => ({ mttr, mtta, sla: null, groups: groups?.groups ?? [], analysts, mode: analystMode })}
          />
        </div>
      </div>

      {/* KPIs — clique nos cards de MTTR abre gráfico histórico */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="MTTR — Média" tipId="MTTR"
          subtitle="Tempo Médio de Resolução"
          bizFmt={mttr?.biz_mean_fmt} wallFmt={mttr?.wall_mean_fmt}
          count={mttr?.count ?? 0}   trend={mttrTrend} loading={mttrLoad}
          onClick={() => setHistModal('mttr')}
        />
        <KPICard
          title={<><Tip id="MTTR">MTTR</Tip> · <Tip id="P50">P50</Tip></>} tipId={null}
          subtitle="Mediana — 50% abaixo deste valor"
          bizFmt={mttr?.biz_p50_fmt}  wallFmt={mttr?.wall_p50_fmt}
          count={mttr?.count ?? 0}    trend={p50Trend}  loading={mttrLoad}
          onClick={() => setHistModal('mttr')}
        />
        <KPICard
          title={<><Tip id="MTTR">MTTR</Tip> · <Tip id="P90">P90</Tip></>} tipId={null}
          subtitle="90% dos chamados abaixo deste tempo"
          bizFmt={mttr?.biz_p90_fmt}  wallFmt={mttr?.wall_p90_fmt}
          count={mttr?.count ?? 0}    trend={p90Trend}  loading={mttrLoad}
          onClick={() => setHistModal('mttr')}
        />
        <KPICard
          title="MTTA — Média" tipId="MTTA"
          subtitle="Tempo até 1ª Ação do Analista"
          bizFmt={mtta?.biz_mean_fmt} wallFmt={mtta?.wall_mean_fmt}
          count={mtta?.count ?? 0}    trend={mttaTrend} loading={mttaLoad}
          onClick={() => setHistModal('mtta')}
        />
      </section>

      {/* Grupos */}
      <section>
        <GroupsSection data={groups} loading={groupsLoad}
          month={apiMonth} startDate={apiStart} endDate={apiEnd}
          onShowHistory={() => setHistModal('volume')} />
      </section>

      {/* Analistas */}
      <section>
        <AnalystPerformanceTable month={apiMonth} startDate={apiStart} endDate={apiEnd}
          onShowHistory={() => setHistModal('mttr')}
          mode={analystMode} setMode={setAnalystMode}
          onAnalystsChange={setAnalysts} />
      </section>

      {/* Modal de histórico */}
      {histModal && (
        <HistoryModal
          metric={histModal}
          onClose={() => setHistModal(null)}
        />
      )}

    </div>
  )
}
