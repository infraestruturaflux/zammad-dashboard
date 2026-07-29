import { useNavigate } from 'react-router-dom'
import { removeToken } from '../api/client'

export default function Header() {
  const navigate = useNavigate()

  const now = new Date().toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

  function handleLogout() {
    removeToken()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-noc-border bg-noc-surface shrink-0">
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <h1 className="text-sm font-bold tracking-wide text-white">NOC Dashboard</h1>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs text-noc-muted">{now}</span>
        <button
          onClick={handleLogout}
          title="Sair"
          className="flex items-center gap-1.5 text-xs text-noc-muted hover:text-red-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Sair
        </button>
      </div>
    </header>
  )
}
