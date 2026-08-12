import axios from 'axios'
import {
  MOCK_QUEUE, MOCK_SLA_ALERTS, MOCK_TEAM_NOW, MOCK_ACTIVITY,
  MOCK_TODAY_ANALYST_LOAD, MOCK_TODAY_FEED, MOCK_ANALYST_LOAD,
  mockTopOffenders, mockTopOffenderDetail, mockAnalystDayDetail, mockDailyVolume,
  MOCK_VOLUME_BY_STATUS, mockVolumeStatusDetail,
  mockMTTRStats, mockMTTAStats, mockSLAStats,
  mockVolumeByGroup, mockAnalystPerformance, mockHistoryRange,
  MOCK_TEAM_STATUS, mockAnalystTickets, mockDayTickets, mockStateTickets,
} from './mockData'

// ── Flag de mock — true = usa dados fictícios (sem backend) ───────────────────
// Mock automático por ambiente:
//   • npm run dev   → usa dados fictícios (.env.development define VITE_USE_MOCK=true)
//   • npm run build → usa a API real (produção)
// Para forçar manualmente, defina VITE_USE_MOCK=true|false no ambiente.
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ── Token helpers ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'noc_token'

export const getToken    = ()          => localStorage.getItem(TOKEN_KEY)
export const setToken    = (t)         => localStorage.setItem(TOKEN_KEY, t)
export const removeToken = ()          => localStorage.removeItem(TOKEN_KEY)

// ── Axios instance ────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: '/api',
  // 60s — cálculos pesados (analyst-performance, mttr) de meses com milhares
  // de tickets podem levar dezenas de segundos no 1º acesso (depois ficam em cache).
  timeout: 60_000,
})

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 → clear token and redirect to /login
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status
    if (status === 401) {
      removeToken()
      window.location.href = '/login'
    } else {
      console.error('[API]', status, err.config?.url)
    }
    return Promise.reject(err)
  },
)

// ── Helpers ───────────────────────────────────────────────────────────────────

const mock = (data) => Promise.resolve(data)
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const mockDelay = (data, ms = 300) => delay(ms).then(() => data)

// ── Auth ──────────────────────────────────────────────────────────────────────

export const login = (username, password) =>
  USE_MOCK
    ? mockDelay({ access_token: 'mock-token', token_type: 'bearer' })
    : api.post('/auth/login', { username, password })

// ── NOC (tempo real) ──────────────────────────────────────────────────────────

export const getQueue = (date = null) =>
  USE_MOCK ? mockDelay(MOCK_QUEUE) : api.get('/noc/queue', { params: date ? { date } : {} })

export const getSLAAlerts = () =>
  USE_MOCK ? mockDelay(MOCK_SLA_ALERTS) : api.get('/noc/sla-alerts')

export const getUrgents = () =>
  USE_MOCK ? mockDelay({ tickets: [], count: 0 }) : api.get('/noc/urgents')

export const getActivity = (limit = 10) =>
  USE_MOCK ? mockDelay(MOCK_ACTIVITY) : api.get('/noc/activity', { params: { limit } })

export const getVIP = () =>
  USE_MOCK ? mockDelay({ tickets: [], count: 0, vip_customers: [] }) : api.get('/noc/vip')

export const getHistory = () =>
  USE_MOCK ? mockDelay({ points: [], days: 0 }) : api.get('/noc/history')

export const getIdle = (idle_days = 3) =>
  USE_MOCK ? mockDelay({ zombies: [], count: 0 }) : api.get('/noc/idle', { params: { idle_days } })

export const getTeamNow = () =>
  USE_MOCK ? mockDelay(MOCK_TEAM_NOW) : api.get('/noc/team-now')

// Situação atual: tickets ativos por analista × estado (em_atend/escal/ag_cliente/ag_terceiros)
export const getTeamStatus = () =>
  USE_MOCK ? mockDelay(MOCK_TEAM_STATUS) : api.get('/metrics/team-status')

// Tickets ativos atualmente atribuídos a um analista (drawer)
export const getAnalystTickets = (owner) =>
  USE_MOCK ? mockDelay(mockAnalystTickets(owner)) : api.get('/metrics/analyst-tickets', { params: { owner } })

// Tickets criados numa data — drill-down do Histórico
export const getDayTickets = (date) =>
  USE_MOCK ? mockDelay(mockDayTickets(date)) : api.get('/metrics/day-tickets', { params: { date } })

// Tickets atualmente num estado — drill-down da Operação
export const getStateTickets = (bucket) =>
  USE_MOCK ? mockDelay(mockStateTickets(bucket)) : api.get('/metrics/state-tickets', { params: { bucket } })

// Tickets atendidos por um analista no período — drill-down da Carga Mensal (Métricas)
export const getAnalystLoadTickets = (owner, month) =>
  USE_MOCK ? mockDelay(mockAnalystTickets(owner)) : api.get('/metrics/analyst-load-tickets', { params: { owner, month } })

export const getTodayFeed = () =>
  USE_MOCK ? mockDelay(MOCK_TODAY_FEED) : api.get('/noc/today-feed')

export const getTodayAnalystLoad = (date = null) =>
  USE_MOCK
    ? mockDelay(MOCK_TODAY_ANALYST_LOAD)
    : api.get('/noc/today-analyst-load', { params: date ? { date } : {} })

// ── Métricas analíticas ───────────────────────────────────────────────────────

export const getTopOffenders = (by = 'customer', startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(mockTopOffenders(by))
    : api.get('/metrics/top-offenders', { params: { by, start_date: startDate, end_date: endDate } })

export const getTopOffenderDetail = (by, name, startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(mockTopOffenderDetail(by, name))
    : api.get('/metrics/top-offender-detail', { params: { by, name, start_date: startDate, end_date: endDate } })

export const getHeatmap = (startDate = null, endDate = null) =>
  USE_MOCK ? mockDelay({ data: [], max_count: 0 }) : api.get('/metrics/heatmap', { params: { start_date: startDate, end_date: endDate } })

export const getFRTStats = (days = 30) =>
  USE_MOCK ? mockDelay({ count: 0 }) : api.get('/metrics/frt', { params: { days } })

export const getFRTToday = () =>
  USE_MOCK ? mockDelay({ count: 0 }) : api.get('/metrics/frt/today')

export const getAnalystLoad = (startDate = null, endDate = null, month = null) =>
  USE_MOCK
    ? mockDelay(MOCK_ANALYST_LOAD)
    : api.get('/metrics/analyst-load', { params: { start_date: startDate, end_date: endDate, month } })

export const getAnalystDayDetail = (date) =>
  USE_MOCK
    ? mockDelay(mockAnalystDayDetail(date))
    : api.get('/metrics/analyst-day-detail', { params: { date } })

export const getDailyVolume = (month = null, owner = null) =>
  USE_MOCK
    ? mockDelay(mockDailyVolume(month, owner))
    : api.get('/metrics/daily-volume', { params: { month, owner } })

export const exportReport = (startDate = null, endDate = null) =>
  api.get('/metrics/export', {
    responseType: 'blob',
    params: { start_date: startDate, end_date: endDate },
  })

// ── Journey (MTTR / MTTA / Desempenho) ───────────────────────────────────────

export const getMTTRStats = (month = null, startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(mockMTTRStats(month, startDate, endDate))
    : api.get('/metrics/mttr', { params: { month, start_date: startDate, end_date: endDate } })

export const getMTTAStats = (month = null, startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(mockMTTAStats(month, startDate, endDate))
    : api.get('/metrics/mtta', { params: { month, start_date: startDate, end_date: endDate } })

export const getSLAStats = (month = null, startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(mockSLAStats(month, startDate, endDate))
    : api.get('/metrics/sla-stats', { params: { month, start_date: startDate, end_date: endDate } })

export const getVolumeByStatus = (month = null, startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(MOCK_VOLUME_BY_STATUS)
    : api.get('/metrics/volume-status', { params: { month, start_date: startDate, end_date: endDate } })

export const getVolumeByGroup = (month = null, startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(mockVolumeByGroup(month, startDate, endDate))
    : api.get('/metrics/volume-by-group', { params: { month, start_date: startDate, end_date: endDate } })

export const getVolumeStatusDetail = (group = null, status, month = null, startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(mockVolumeStatusDetail(group, status))
    : api.get('/metrics/volume-status-detail', { params: { group, status, month, start_date: startDate, end_date: endDate } })

export const getAnalystPerformance = (month = null, startDate = null, endDate = null) =>
  USE_MOCK
    ? mockDelay(mockAnalystPerformance(month, startDate, endDate))
    : api.get('/metrics/analyst-performance', { params: { month, start_date: startDate, end_date: endDate } })

// Histórico genérico por intervalo de datas (bucketing automático no backend/mock)
export const getHistoryRange = (metric, startDate, endDate) =>
  USE_MOCK
    ? mockDelay(mockHistoryRange(metric, startDate, endDate))
    : api.get('/metrics/history-range', { params: { metric, start_date: startDate, end_date: endDate } })

export const getTicketJourney = (ticketId) =>
  USE_MOCK
    ? mockDelay({ error: 'mock' })
    : api.get(`/metrics/journey/${ticketId}`)
