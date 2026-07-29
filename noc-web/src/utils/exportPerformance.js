// ── Exportação da página Desempenho Operacional (Excel / PDF) ─────────────────
// Gera o arquivo no próprio navegador a partir dos dados já carregados na tela.

import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/** "joao.bortolaci@flux.net.br" → "Joao Bortolaci" */
function fullName(owner) {
  if (!owner || owner === '-') return owner ?? '?'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local.split(/[.\s_-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

const STATUS_LABELS = {
  em_atendimento: 'Em Atend.', ag_cliente: 'Ag. Cliente', ag_terceiros: 'Ag. Terceiros',
  escalonado: 'Escalonado', resolvido: 'Resolvido', fechado: 'Fechado', novo: 'Novo', outros: 'Outros',
}

/** Monta o nome do arquivo com o período */
function fileBase(periodLabel) {
  const safe = (periodLabel || 'periodo').replace(/[^\w-]+/g, '_')
  return `desempenho_noc_${safe}`
}

// ── Coleta as linhas estruturadas (compartilhado entre Excel e PDF) ───────────

function buildRows({ mttr, mtta, sla, groups, analysts, mode }) {
  // KPIs
  const kpis = [
    ['MTTR — Média',  mttr?.biz_mean_fmt ?? '—', mttr?.wall_mean_fmt ?? '—', mttr?.count ?? 0],
    ['MTTR — P50',    mttr?.biz_p50_fmt  ?? '—', mttr?.wall_p50_fmt  ?? '—', mttr?.count ?? 0],
    ['MTTR — P90',    mttr?.biz_p90_fmt  ?? '—', mttr?.wall_p90_fmt  ?? '—', mttr?.count ?? 0],
    ['MTTA — Média',  mtta?.biz_mean_fmt ?? '—', mtta?.wall_mean_fmt ?? '—', mtta?.count ?? 0],
    ['SLA Cumprido',  sla?.sla_pct != null ? `${sla.sla_pct}%` : '—', `${sla?.met ?? 0}/${sla?.count ?? 0}`, sla?.count ?? 0],
  ]

  // Grupos
  const groupRows = (groups ?? []).map(g => {
    const breakdown = Object.entries(g.by_state)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${STATUS_LABELS[k] ?? k}: ${n} (${Math.round(n / g.total * 100)}%)`)
      .join(' · ')
    return [g.name, g.total, breakdown]
  })

  // Analistas — usa o modo selecionado (úteis / corridas)
  const f = (a, field) => mode === 'biz'
    ? (a[`${field}_fmt`] ?? a[`${field}_biz_fmt`] ?? '—')
    : (a[`${field}_wall_fmt`] ?? '—')
  const v = (a, field) => mode === 'biz' ? (a[`${field}_biz_h`] ?? 0) : (a[`${field}_wall_h`] ?? 0)

  const analystRows = (analysts ?? []).map(a => {
    const total = v(a, 'active') + v(a, 'ag_cliente') + v(a, 'ag_terceiros')
    const pctAct = total > 0 ? Math.round((v(a, 'active') / total) * 100) : 0
    return [
      fullName(a.owner),
      a.tickets_count,
      f(a, 'active'),
      f(a, 'ag_cliente'),
      f(a, 'ag_terceiros'),
      a.fcr_pct != null ? `${a.fcr_pct}%` : '—',
      `${pctAct}%`,
    ]
  })

  return { kpis, groupRows, analystRows }
}

// ── Exportar para Excel (.xlsx) ───────────────────────────────────────────────

export function exportToExcel(data, periodLabel) {
  const { kpis, groupRows, analystRows } = buildRows(data)
  const modeLabel = data.mode === 'biz' ? 'Horas Úteis (08h-19h)' : 'Horas Corridas (24h)'

  const wb = XLSX.utils.book_new()

  // Aba 1 — Resumo (KPIs)
  const wsKpi = XLSX.utils.aoa_to_sheet([
    ['Desempenho Operacional — NOC Dashboard'],
    [`Período: ${periodLabel}`],
    [],
    ['Indicador', 'Horas Úteis', 'Horas Corridas', 'Tickets'],
    ...kpis,
  ])
  wsKpi['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsKpi, 'Resumo')

  // Aba 2 — Volume por Grupo
  const wsGroups = XLSX.utils.aoa_to_sheet([
    ['Volume por Grupo'],
    [],
    ['Grupo', 'Total', 'Quebra por Status'],
    ...groupRows,
  ])
  wsGroups['!cols'] = [{ wch: 24 }, { wch: 8 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, wsGroups, 'Grupos')

  // Aba 3 — Desempenho por Analista
  const wsAnalysts = XLSX.utils.aoa_to_sheet([
    [`Desempenho por Analista — ${modeLabel}`],
    [],
    ['Analista', 'Tickets', 'Ativo', 'Ag. Cliente', 'Ag. Terceiros', 'FCR', '% Ativo'],
    ...analystRows,
  ])
  wsAnalysts['!cols'] = [{ wch: 22 }, { wch: 9 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 8 }, { wch: 9 }]
  XLSX.utils.book_append_sheet(wb, wsAnalysts, 'Analistas')

  XLSX.writeFile(wb, `${fileBase(periodLabel)}.xlsx`)
}

// ── Exportar para PDF ─────────────────────────────────────────────────────────

export function exportToPDF(data, periodLabel) {
  const { kpis, groupRows, analystRows } = buildRows(data)
  const modeLabel = data.mode === 'biz' ? 'Horas Úteis (08h-19h seg-sex)' : 'Horas Corridas (24h)'

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const NAVY = [15, 23, 42]
  const SKY  = [2, 132, 199]

  // Cabeçalho
  doc.setFontSize(16); doc.setTextColor(...NAVY); doc.setFont(undefined, 'bold')
  doc.text('Desempenho Operacional — NOC Dashboard', 14, 18)
  doc.setFontSize(10); doc.setTextColor(100); doc.setFont(undefined, 'normal')
  doc.text(`Período: ${periodLabel}`, 14, 25)
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30)

  // KPIs
  autoTable(doc, {
    startY: 36,
    head: [['Indicador', 'Horas Úteis', 'Horas Corridas', 'Tickets']],
    body: kpis,
    theme: 'striped',
    headStyles: { fillColor: SKY, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  })

  // Grupos
  doc.setFontSize(12); doc.setTextColor(...NAVY); doc.setFont(undefined, 'bold')
  doc.text('Volume por Grupo', 14, doc.lastAutoTable.finalY + 10)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['Grupo', 'Total', 'Quebra por Status']],
    body: groupRows,
    theme: 'striped',
    headStyles: { fillColor: SKY, fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: { 2: { cellWidth: 110 } },
    margin: { left: 14, right: 14 },
  })

  // Analistas
  doc.setFontSize(12); doc.setTextColor(...NAVY); doc.setFont(undefined, 'bold')
  doc.text(`Desempenho por Analista — ${modeLabel}`, 14, doc.lastAutoTable.finalY + 10)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['Analista', 'Tickets', 'Ativo', 'Ag. Cliente', 'Ag. Terceiros', 'FCR', '% Ativo']],
    body: analystRows,
    theme: 'striped',
    headStyles: { fillColor: SKY, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  })

  doc.save(`${fileBase(periodLabel)}.pdf`)
}
