import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import Metrics from './pages/Metrics'
import History from './pages/History'
import HistoryNew from './pages/HistoryNew'
import Performance from './pages/Performance'
import PerformanceNew from './pages/PerformanceNew'
import Overview from './pages/Overview'
import MetricsNew from './pages/MetricsNew'
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
            {/* Operação = nova Visão Operacional (redesign) */}
            <Route path="/"        element={<Overview />} />
            {/* Painel antigo preservado (dados reais) até o redesign ser ligado ao backend */}
            <Route path="/classic" element={<Home />} />
            <Route path="/overview" element={<Navigate to="/" replace />} />
            {/* Métricas = nova versão (redesign) */}
            <Route path="/metrics" element={<MetricsNew />} />
            {/* Métricas antiga preservada (dados reais + exportação) */}
            <Route path="/metrics-classic" element={<Metrics />} />
            <Route path="/metrics-new" element={<Navigate to="/metrics" replace />} />
            {/* Histórico = nova versão (redesign) */}
            <Route path="/history" element={<HistoryNew />} />
            {/* Histórico antigo preservado (dados reais) */}
            <Route path="/history-classic" element={<History />} />
            {/* Desempenho = nova versão (redesign) */}
            <Route path="/performance" element={<PerformanceNew />} />
            {/* Desempenho antigo preservado (dados reais) */}
            <Route path="/performance-classic" element={<Performance />} />
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
