export default function SLAAlerts({ alerts = [], loading }) {
  if (loading && !alerts.length) return null
  if (!alerts.length) return null

  return (
    <div className="noc-card flex flex-col gap-2">
      <h2 className="text-xs uppercase tracking-widest text-noc-muted">Alertas de SLA</h2>
      <ul className="flex flex-col gap-1.5">
        {alerts.map((a) => {
          const urgent = a.minutes_remaining < 5
          const warn   = a.minutes_remaining < 15
          return (
            <li key={`${a.ticket_id}-${a.breach_type}`}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs
                ${urgent ? 'bg-red-500/10 border border-red-500/30'
                  : warn ? 'bg-orange-500/10 border border-orange-500/30'
                  : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
              <span className={`font-mono font-bold shrink-0 ${urgent ? 'text-red-400' : warn ? 'text-orange-400' : 'text-yellow-400'}`}>
                #{a.number}
              </span>
              <span className="text-white truncate flex-1">{a.title}</span>
              <span className={`shrink-0 font-semibold tabular-nums ${urgent ? 'text-red-400' : warn ? 'text-orange-400' : 'text-yellow-400'}`}>
                {Math.round(a.minutes_remaining)}m · {a.breach_type === 'response' ? 'TMA' : 'TMR'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
