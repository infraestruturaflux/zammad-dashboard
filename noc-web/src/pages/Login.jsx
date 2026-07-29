import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, setToken } from '../api/client'

export default function Login() {
  const navigate            = useNavigate()
  const [user, setUser]     = useState('')
  const [pass, setPass]     = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(user.trim(), pass)
      setToken(data.access_token)
      navigate('/', { replace: true })
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(detail ?? 'Usuário ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-noc-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 mb-4">
            <svg className="w-7 h-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">NOC Dashboard</h1>
          <p className="text-xs text-noc-muted mt-1">Flux Telecom — Monitoramento</p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit}
          className="noc-card flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-widest text-noc-muted">Acesso ao painel</h2>

          {/* Usuário */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-noc-muted" htmlFor="username">Usuário</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
              placeholder="noc@flux"
              className="w-full rounded-lg bg-noc-border border border-noc-border px-3 py-2 text-sm text-white
                         placeholder:text-noc-muted focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {/* Senha */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-noc-muted" htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-lg bg-noc-border border border-noc-border px-3 py-2 text-sm text-white
                         placeholder:text-noc-muted focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {/* Erro */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Botão */}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50
                       text-white font-semibold text-sm py-2.5 transition-colors"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
