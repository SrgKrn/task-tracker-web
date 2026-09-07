import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ROBOTO_REGULAR_BASE64 } from './pdfFont.generated'
import type { ReportData } from './report'

const FONT_NAME = 'Roboto'

function registerCyrillicFont(doc: jsPDF) {
  // jsPDF's built-in fonts have no Cyrillic glyphs — embed one, once per document.
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64)
  doc.addFont('Roboto-Regular.ttf', FONT_NAME, 'normal')
  doc.setFont(FONT_NAME)
}

export async function exportPdf(data: ReportData) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  registerCyrillicFont(doc)

  doc.setFontSize(16)
  doc.text('Отчёт по задачам и времени', 14, 15)
  doc.setFontSize(10)
  doc.text(`Период: ${data.from} — ${data.to}`, 14, 22)

  doc.setFontSize(11)
  const summaryLines = [
    `Часов затрачено (факт): ${data.totalFactHours.toFixed(2)}`,
    `Часов запланировано: ${data.totalPlanHours.toFixed(2)}`,
    `Незапланировано (перелимит): ${data.totalOverHours.toFixed(2)}`,
    `Задач закрыто за период: ${data.tasksClosed}`,
  ]
  summaryLines.forEach((line, i) => doc.text(line, 14, 30 + i * 6))

  autoTable(doc, {
    startY: 30 + summaryLines.length * 6 + 6,
    head: [['Задача', 'Проект', 'Раздел', 'Статус', 'План, ч', 'Факт за период, ч', 'Срок с', 'Срок до']],
    body: data.tasks.map((t) => [
      t.name,
      t.project,
      t.section,
      t.status,
      t.planHours.toFixed(2),
      t.factHoursInRange.toFixed(2),
      t.startDate ?? '',
      t.endDate ?? '',
    ]),
    styles: { font: FONT_NAME, fontSize: 8 },
    headStyles: { font: FONT_NAME, fontStyle: 'normal' },
    margin: { left: 14, right: 14 },
  })

  doc.addPage()
  doc.setFont(FONT_NAME)
  doc.setFontSize(14)
  doc.text('Время по сессиям', 14, 15)

  autoTable(doc, {
    startY: 22,
    head: [['Дата', 'Задача', 'Проект', 'Раздел', 'Часы', 'Тип']],
    body: data.entries.map((e) => [e.dateTime, e.task, e.project, e.section, e.durationHours.toFixed(2), e.type]),
    styles: { font: FONT_NAME, fontSize: 8 },
    headStyles: { font: FONT_NAME, fontStyle: 'normal' },
    margin: { left: 14, right: 14 },
  })

  doc.save(`Отчёт_${data.from}_${data.to}.pdf`)
}
