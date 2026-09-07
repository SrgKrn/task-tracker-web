import ExcelJS from 'exceljs'
import type { ReportData } from './report'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportExcel(data: ReportData) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Хронограф'
  workbook.created = new Date()

  const summary = workbook.addWorksheet('Сводка')
  summary.columns = [
    { header: 'Показатель', key: 'k', width: 28 },
    { header: 'Значение', key: 'v', width: 16 },
  ]
  summary.addRows([
    { k: 'Период', v: `${data.from} — ${data.to}` },
    { k: 'Часов затрачено (факт)', v: Number(data.totalFactHours.toFixed(2)) },
    { k: 'Часов запланировано', v: Number(data.totalPlanHours.toFixed(2)) },
    { k: 'Незапланировано (перелимит)', v: Number(data.totalOverHours.toFixed(2)) },
    { k: 'Задач закрыто за период', v: data.tasksClosed },
  ])
  summary.getRow(1).font = { bold: true }

  const tasksSheet = workbook.addWorksheet('Задачи')
  tasksSheet.columns = [
    { header: 'Задача', key: 'name', width: 32 },
    { header: 'Проект', key: 'project', width: 20 },
    { header: 'Раздел', key: 'section', width: 20 },
    { header: 'Статус', key: 'status', width: 16 },
    { header: 'План, ч', key: 'planHours', width: 10 },
    { header: 'Факт за период, ч', key: 'factHoursInRange', width: 16 },
    { header: 'Срок с', key: 'startDate', width: 12 },
    { header: 'Срок до', key: 'endDate', width: 12 },
  ]
  for (const t of data.tasks) {
    tasksSheet.addRow({
      ...t,
      planHours: Number(t.planHours.toFixed(2)),
      factHoursInRange: Number(t.factHoursInRange.toFixed(2)),
    })
  }
  tasksSheet.getRow(1).font = { bold: true }

  const entriesSheet = workbook.addWorksheet('Время')
  entriesSheet.columns = [
    { header: 'Дата', key: 'dateTime', width: 14 },
    { header: 'Задача', key: 'task', width: 32 },
    { header: 'Проект', key: 'project', width: 20 },
    { header: 'Раздел', key: 'section', width: 20 },
    { header: 'Часы', key: 'durationHours', width: 10 },
    { header: 'Тип', key: 'type', width: 14 },
  ]
  for (const e of data.entries) {
    entriesSheet.addRow({ ...e, durationHours: Number(e.durationHours.toFixed(2)) })
  }
  entriesSheet.getRow(1).font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, `Отчёт_${data.from}_${data.to}.xlsx`)
}
