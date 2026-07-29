const VARIANTS = {
  chamados_abertos: {
    label: 'Abertos', sublabel: 'aguardando triagem',
    icon: '◎', color: 'text-sky-400', ring: 'ring-sky-500/40', bg: 'bg-sky-500/10', invert: false,
  },
  em_atendimento: {
    label: 'Em Atendimento', sublabel: 'com analista',
    icon: '◈', color: 'text-yellow-400', ring: 'ring-yellow-500/40', bg: 'bg-yellow-500/10', invert: false,
  },
  aguardando_cliente: {
    label: 'Ag. Cliente', sublabel: 'resp. pendente',
    icon: '⏸', color: 'text-orange-400', ring: 'ring-orange-500/40', bg: 'bg-orange-500/10', invert: false,
  },
  aguardando_terceiros: {
    label: 'Ag. Terceiros', sublabel: 'aguardando fornecedor',
    icon: '⏳', color: 'text-amber-400', ring: 'ring-amber-500/40', bg: 'bg-amber-500/10', invert: false,
  },
  resolvidos_hoje: {
    label: 'Resolvidos', sublabel: 'hoje',
    icon: '✓', color: 'text-emerald-400', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10', invert: true,
  },
  fechados_hoje: {
    label: 'Fechados', sublabel: 'hoje',
    icon: '■', color: 'text-slate-400', ring: 'ring-slate-500/40', bg: 'bg-slate-500/10', invert: true,
  },
}

function TrendBadge({ pct, invert }) {
  if (pct === null || pct === undefined) return null
  if (pct === 0) return <span className="text-xs text-noc-muted tabular-nums">→ 0%</span>
  const up     = pct > 0
  const isGood = invert ? up : !up
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums
      ${isGood ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

export default function QueueCard({ type, count, loading, trend }) {
  const v = VARIANTS[type] ?? VARIANTS.chamados_abertos
  return (
    <div className={`noc-card ring-1 ${v.ring} ${v.bg} flex flex-col items-center gap-2 py-5`}>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm ${v.color}`}>{v.icon}</span>
        <span className="text-xs uppercase tracking-widest text-noc-muted text-center leading-tight">{v.label}</span>
      </div>
      <span className={`text-6xl font-black tabular-nums leading-none ${v.color} ${loading ? 'opacity-40' : ''}`}>
        {loading ? '…' : (count ?? 0)}
      </span>
      <div className="flex items-center gap-2 h-4">
        <span className="text-xs text-noc-muted">{v.sublabel}</span>
        <TrendBadge pct={trend} invert={v.invert} />
      </div>
    </div>
  )
}
