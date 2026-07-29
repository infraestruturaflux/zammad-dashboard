// ── Exportação da página Métricas Analíticas (Excel / PDF) ────────────────────
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function fullName(owner) {
  if (!owner || owner === '-') return owner ?? '?'
  const local = owner.includes('@') ? owner.split('@')[0] : owner
  return local.split(/[.\s_-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

function fileBase(label) {
  const safe = (label || 'periodo').replace(/[^\w-]+/g, '_')
  return `metricas_noc_${safe}`
}

// rows: [{ name, ticket_count }] → [[rank, name, count]]
function rankRows(items) {
  return (items ?? []).map((it, i) => [i + 1, it.name ?? fullName(it.owner), it.ticket_count])
}

// ── Excel ─────────────────────────────────────────────────────────────────────

export function exportToExcel({ offCustomer, offGroup, analystLoad }, periodLabel) {
  const wb = XLSX.utils.book_new()

  const wsCust = XLSX.utils.aoa_to_sheet([
    [`Top Ofensores por Cliente — ${periodLabel}`], [],
    ['#', 'Cliente', 'Chamados'],
    ...rankRows(offCustomer),
  ])
  wsCust['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsCust, 'Top Clientes')

  const wsGroup = XLSX.utils.aoa_to_sheet([
    [`Top Ofensores por Grupo — ${periodLabel}`], [],
    ['#', 'Grupo', 'Chamados'],
    ...rankRows(offGroup),
  ])
  wsGroup['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsGroup, 'Top Grupos')

  const wsLoad = XLSX.utils.aoa_to_sheet([
    [`Carga por Analista — ${periodLabel}`], [],
    ['#', 'Analista', 'Chamados'],
    ...(analystLoad ?? []).map((a, i) => [i + 1, fullName(a.owner), a.ticket_count]),
  ])
  wsLoad['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsLoad, 'Carga Analista')

  XLSX.writeFile(wb, `${fileBase(periodLabel)}.xlsx`)
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export function exportToPDF({ offCustomer, offGroup, analystLoad }, periodLabel) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const NAVY = [15, 23, 42]
  const SKY  = [2, 132, 199]

  doc.setFontSize(16); doc.setTextColor(...NAVY); doc.setFont(undefined, 'bold')
  doc.text('Métricas Analíticas — NOC Dashboard', 14, 18)
  doc.setFontSize(10); doc.setTextColor(100); doc.setFont(undefined, 'normal')
  doc.text(`Período: ${periodLabel}`, 14, 25)
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30)

  doc.setFontSize(12); doc.setTextColor(...NAVY); doc.setFont(undefined, 'bold')
  doc.text('Top Ofensores por Cliente', 14, 38)
  autoTable(doc, {
    startY: 41,
    head: [['#', 'Cliente', 'Chamados']],
    body: rankRows(offCustomer),
    theme: 'striped', headStyles: { fillColor: SKY, fontSize: 9 }, bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  })

  doc.setFontSize(12); doc.setTextColor(...NAVY); doc.setFont(undefined, 'bold')
  doc.text('Top Ofensores por Grupo', 14, doc.lastAutoTable.finalY + 10)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['#', 'Grupo', 'Chamados']],
    body: rankRows(offGroup),
    theme: 'striped', headStyles: { fillColor: SKY, fontSize: 9 }, bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  })

  doc.setFontSize(12); doc.setTextColor(...NAVY); doc.setFont(undefined, 'bold')
  doc.text('Carga por Analista', 14, doc.lastAutoTable.finalY + 10)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['#', 'Analista', 'Chamados']],
    body: (analystLoad ?? []).map((a, i) => [i + 1, fullName(a.owner), a.ticket_count]),
    theme: 'striped', headStyles: { fillColor: SKY, fontSize: 9 }, bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  })

  doc.save(`${fileBase(periodLabel)}.pdf`)
}
