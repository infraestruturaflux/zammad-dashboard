import { useCallback, useState } from 'react'
import { getQueue } from '../api/client'
import AnalystLoadToday from '../components/AnalystLoadToday'
import LiveTicker from '../components/LiveTicker'
import MiniTeamStatus from '../components/MiniTeamStatus'
import QueueCard from '../components/QueueCard'
import TodayFeed from '../components/TodayFeed'
import { usePolling } from '../hooks/usePolling'

const QUEUE_INTERVAL = 30_000

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
function fmtDateBR(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const TODAY = todayISO()
const QUEUE_PRESETS = [
  { label: 'Hoje',   value: TODAY },
  { label: 'Ontem',  value: offsetDate(-1) },
  { label: 'D-2',    value: offsetDate(-2) },
  { label: 'D-3',    value: offsetDate(-3) },
]

export default function Home() {
  const [queueDate,    setQueueDate]    = useState(TODAY)
  const [queueCustom,  setQueueCustom]  = useState('')

  const queueDateParam = queueDate === TODAY ? null : queueDate

  const queueFn = useCallback(() => getQueue(queueDateParam), [queueDateParam])
  const queue   = usePolling(queueFn, queueDate === TODAY ? QUEUE_INTERVAL : 0)

  const q = queue.data

  function applyQueueCustom(e) {
    const v = e.target.value
    setQueueCustom(v)
    if (v) setQueueDate(v)
  }

  const isQueueHistory = queueDate !== TODAY

  return (
    <div className="flex flex-col gap-5">

      {/* ── 1. KPIs — Termômetro de Fila ─────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label>Termômetro de Fila</Label>

          {/* Filtro de data */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUEUE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => { setQueueDate(p.value); setQueueCustom('') }}
                className={`px-2 py-0.5 rounded text-xs transition-colors
                  ${queueDate === p.value
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'text-noc-muted hover:text-white'}`}
              >
                {p.label}
              </button>
            ))}
            <input
              type="date"
              value={queueCustom}
              max={TODAY}
              onChange={applyQueueCustom}
              className="px-2 py-0.5 rounded text-xs bg-noc-surface border border-noc-border
                text-noc-muted focus:outline-none focus:border-sky-500 focus:text-white
                [color-scheme:dark] cursor-pointer"
            />
          </div>
        </div>

        {/* Banner sempre presente para não causar layout shift — só muda visibilidade */}
        <p className={`text-[10px] transition-opacity duration-200 h-3 leading-tight
          ${isQueueHistory ? 'text-amber-400/70' : 'invisible'}`}>
          Exibindo snapshot de {fmtDateBR(queueDate)} — dados históricos, sem atualização automática.
        </p>

        <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 transition-opacity duration-150 ${queue.loading ? 'opacity-60' : 'opacity-100'}`}>
          <QueueCard type="chamados_abertos"     count={q?.chamados_abertos}     loading={false} trend={isQueueHistory ? null : q?.trend_chamados_abertos} />
          <QueueCard type="em_atendimento"       count={q?.em_atendimento}       loading={false} trend={isQueueHistory ? null : q?.trend_em_atendimento} />
          <QueueCard type="aguardando_cliente"   count={q?.aguardando_cliente}   loading={false} trend={isQueueHistory ? null : q?.trend_aguardando_cliente} />
          <QueueCard type="aguardando_terceiros" count={q?.aguardando_terceiros} loading={false} trend={isQueueHistory ? null : q?.trend_aguardando_terceiros} />
          <QueueCard type="resolvidos_hoje"      count={q?.resolvidos_hoje}      loading={false} trend={isQueueHistory ? null : q?.trend_resolvidos_hoje} />
          <QueueCard type="fechados_hoje"        count={q?.fechados_hoje}        loading={false} trend={isQueueHistory ? null : q?.trend_fechados_hoje} />
        </div>

        {queue.error && (
          <Err>
            {queue.error?.response?.status === 404
              ? `Sem snapshot para ${fmtDateBR(queueDate)} — dashboard não estava ativo nesse dia.`
              : 'Erro ao carregar fila — backend offline?'}
          </Err>
        )}
      </section>

      {/* ── 2. Equipe Ativa no Momento ────────────────────────────────────── */}
      <section>
        <MiniTeamStatus />
      </section>

      {/* ── 3. Batimento da Operação ──────────────────────────────────────── */}
      <section>
        <LiveTicker />
      </section>

      {/* ── 4. Carga por Analista (Hoje) · Feed de Chamados do Dia ─────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        <AnalystLoadToday />
        <TodayFeed />
      </section>

      <footer className="text-xs text-noc-muted text-right">
        Fila: {QUEUE_INTERVAL / 1000}s · Atividade: 20s · Feed: 15s · Carga Hoje: 15s
      </footer>

    </div>
  )
}

function Label({ children }) {
  return <h2 className="text-xs uppercase tracking-widest text-noc-muted">{children}</h2>
}

function Err({ children, className = '' }) {
  return <p className={`text-xs text-red-400 ${className}`}>✗ {children}</p>
}
