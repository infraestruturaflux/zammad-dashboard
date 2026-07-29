import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/',            icon: '◉', label: 'Operação'    },
  { to: '/metrics',     icon: '▦', label: 'Métricas'    },
  { to: '/history',     icon: '↗', label: 'Histórico'   },
  { to: '/performance', icon: '⏱', label: 'Desempenho'  },
  { to: '/parados',     icon: '⏸', label: 'Parados'     },
]

export default function Sidebar() {
  return (
    <nav className="w-14 lg:w-44 shrink-0 border-r border-noc-border bg-noc-surface flex flex-col gap-1 p-2">
      {LINKS.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
            ${isActive
              ? 'bg-sky-500/20 text-sky-400 font-semibold'
              : 'text-noc-muted hover:text-white hover:bg-white/5'}`
          }
        >
          <span className="text-base shrink-0">{icon}</span>
          <span className="hidden lg:inline truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
