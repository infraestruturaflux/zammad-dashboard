// ── Exportação de listas de chamados (Métricas) para Excel ────────────────────
// Gera o .xlsx no próprio navegador, com os chamados ordenados por estado.
import * as XLSX from 'xlsx'

function fullName(owner) {
  if (!owner || owner === '-') return owner ?? '—'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local.split(/[.\s_-]+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}
function slug(s) {
  return (s || 'export').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '').slice(0, 60)
}

// Ordem de estado pedida: Em Atend. → Ag. Cliente → Ag. Terceiros → Escalonado → Aberto → Resolvido → Fechado
const STATE_RANK = {
  'em atendimento': 1,
  'aguardando cliente': 2, 'ag. cliente': 2,
  'aguardando terceiros': 3, 'ag. terceiros': 3,
  'escalonado dev': 4, 'escalonado rotas': 4, 'escalonado infra': 4,
  'aberto': 5, 'novo': 5, 'new': 5,
  'resolvido': 6,
  'closed': 7, 'fechado': 7, 'merged': 7,
}
const rank = s => STATE_RANK[(s || '').toLowerCase().trim()] ?? 90

/** Exporta uma lista de chamados para .xlsx, ordenada por estado. */
export function exportTicketsXlsx(title, tickets, { includeOwner = false } = {}) {
  const sorted = [...(tickets || [])].sort((a, b) =>
    rank(a.state) - rank(b.state) || String(a.number).localeCompare(String(b.number)))

  const header = includeOwner ? ['Nº', 'Título', 'Estado', 'Analista'] : ['Nº', 'Título', 'Estado']
  const data = sorted.map(t => includeOwner
    ? [t.number, t.title, t.state, fullName(t.owner)]
    : [t.number, t.title, t.state])

  const ws = XLSX.utils.aoa_to_sheet([[title], [`${sorted.length} chamados · exportado em ${new Date().toLocaleString('pt-BR')}`], [], header, ...data])
  ws['!cols'] = includeOwner ? [{ wch: 12 }, { wch: 60 }, { wch: 20 }, { wch: 24 }] : [{ wch: 12 }, { wch: 60 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Chamados')
  XLSX.writeFile(wb, `${slug(title)}.xlsx`)
}

/** Exporta a tabela de Situação Atual da Equipe (analista × estado). */
export function exportTeamStatusXlsx(title, rows) {
  const header = ['Analista', 'Em Atend.', 'Escal. Dev', 'Ag. Cliente', 'Ag. Terceiros', 'Total']
  const data = (rows || []).map(r => [r.name, r.em_atend, r.escal_dev, r.ag_cliente, r.ag_terceiros, r.total])
  const sum = k => (rows || []).reduce((s, r) => s + (r[k] || 0), 0)
  const totals = ['Total', sum('em_atend'), sum('escal_dev'), sum('ag_cliente'), sum('ag_terceiros'), sum('total')]

  const ws = XLSX.utils.aoa_to_sheet([[title], [`exportado em ${new Date().toLocaleString('pt-BR')}`], [], header, ...data, totals])
  ws['!cols'] = [{ wch: 24 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Situação')
  XLSX.writeFile(wb, `${slug(title)}.xlsx`)
}
