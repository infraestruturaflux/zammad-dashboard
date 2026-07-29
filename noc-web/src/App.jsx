import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import Metrics from './pages/Metrics'
import History from './pages/History'
import Performance from './pages/Performance'
import ChamadosParados from './pages/ChamadosParados'
import Login from './pages/Login'
import { getToken } from './api/client'

// ── Guard: redireciona para /login se não houver token ────────────────────────
function RequireAuth({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return children
}

// ── Layout principal com Header + Sidebar ─────────────────────────────────────
function DashboardLayout() {
  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Routes>
            <Route path="/"        element={<Home />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/history" element={<History />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/parados"     element={<ChamadosParados />} />
            <Route path="*"        element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  )
}
