import ExcelJS from 'exceljs'
import type { ReportData } from './report'

/*
 * Excel — для своего анализа. Те же числа, что в PDF, но живые: настоящие даты и часы,
 * фильтры на каждом листе, полоски прямо в ячейках, а лист «Записи» — готовая таблица
 * для «Вставка → Сводная таблица».
 */

const BRASS = 'FFC98A2E'
const HEAD_FILL = 'FFF3F1EC'
const WEEKEND_FILL = 'FFF6F4F0'
const MUTED = 'FF6B6B74'
const TERRA = 'FFA8432C'
const GREEN = 'FF4D8259'
const HOURS = '0.00'

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

/** дата как настоящая дата Excel: по ней работают сортировка, фильтры и группировка */
function excelDate(iso: string | null): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** часы в ячейке: формат показывает два знака, а хранится четыре — иначе суммы
 *  по сотням записей расходятся с итогом на сотые доли часа */
const round2 = (v: number) => Math.round(v * 10000) / 10000

interface Col {
  header: string
  key: string
  width: number
  fmt?: string
}

/** лист с шапкой, закреплённой строкой заголовков и фильтром */
function sheet(wb: ExcelJS.Workbook, name: string, cols: Col[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }))
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.alignment = { vertical: 'middle', wrapText: true }
  head.height = 30
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD8D5CE' } } }
  })
  return ws
}

function filter(ws: ExcelJS.Worksheet, columns: number) {
  if (ws.rowCount < 2) return
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: columns } }
}

/** полоски в ячейках: видно, где много, без отдельного графика */
function dataBar(ws: ExcelJS.Worksheet, ref: string) {
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        gradient: false,
        minLength: 0,
        maxLength: 100,
        cfvo: [{ type: 'num', value: 0 }, { type: 'max' }],
        // в типах ExcelJS цвета полосы нет, а в файл он пишется
        ...({ color: { argb: BRASS } } as object),
      } as ExcelJS.DataBarRuleType,
    ],
  })
}

/** Книга без скачивания — её же можно открыть и проверить содержимое. */
export function buildWorkbook(r: ReportData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Semternity'
  wb.created = r.generatedAt
  const prevCol = r.prevName === 'прошлый период' ? 'Прошлый период' : r.prevName[0].toUpperCase() + r.prevName.slice(1)
  const curCol = r.curName === 'этот период' ? 'Этот период' : r.curName[0].toUpperCase() + r.curName.slice(1)

  /* ── Обзор ─────────────────────────────────────────────────── */
  const ov = wb.addWorksheet('Обзор')
  ov.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 14 }]
  ov.getCell('A1').value = `Отчёт за период: ${r.label}`
  ov.getCell('A1').font = { bold: true, size: 14 }
  ov.getCell('A2').value = `Сравнение — с ${r.prevWith}. Сформирован ${r.generatedAt.toLocaleString('ru-RU')}`
  ov.getCell('A2').font = { color: { argb: MUTED } }

  const head = ov.getRow(4)
  head.values = ['Показатель', curCol, prevCol, 'Разница']
  head.font = { bold: true }
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }
  })
  const kpis: [string, number | null, number | null, string][] = [
    ['Часов всего', round2(r.total), round2(r.prevTotal), HOURS],
    ['Цель периода, ч', r.target ? round2(r.target.hours) : null, null, HOURS],
    ['Выполнение цели', r.target && r.target.hours > 0 ? r.total / r.target.hours : null, null, '0%'],
    ['В среднем за будний день, ч', r.avgPerWeekday !== null ? round2(r.avgPerWeekday) : null, null, HOURS],
    ['Дней с записями', r.daysWithEntries, null, '0'],
    ['Задач в работе', r.inWorkCount, null, '0'],
    ['Закрыто', r.closedCount, null, '0'],
    ['Вышли за план (спринтов)', r.overCount, null, '0'],
    ['Часов сверх плана', round2(r.overHours), null, HOURS],
    ['Срок прошёл, не закрыты', r.overdueCount, null, '0'],
    ['Часов без плана', round2(r.unplannedHours), null, HOURS],
    ['Подтверждено таймером', r.total > 0 ? Math.min(1, r.composition.timer / r.total) : null, null, '0%'],
  ]
  kpis.forEach(([label, cur, prev, fmt], i) => {
    const row = ov.getRow(5 + i)
    row.values = [label, cur, prev, cur !== null && prev !== null ? round2(cur - prev) : null]
    for (const c of [2, 3, 4]) row.getCell(c).numFmt = fmt
  })
  let line = 5 + kpis.length + 1
  if (r.prevIncompleteSince) {
    ov.getCell(`A${line}`).value = `Учёт ведётся с ${r.prevIncompleteSince.split('-').reverse().join('.')} — ${r.prevName} учтён не целиком, рост к нему завышен.`
    ov.getCell(`A${line}`).font = { italic: true, color: { argb: MUTED } }
    line += 2
  }
  if (r.insights.length) {
    ov.getCell(`A${line}`).value = 'Главное'
    ov.getCell(`A${line}`).font = { bold: true }
    for (const s of r.insights) {
      line += 1
      ov.getCell(`A${line}`).value = `• ${s}`
    }
  }

  /* ── По дням ───────────────────────────────────────────────── */
  const days = sheet(wb, 'По дням', [
    { header: 'Дата', key: 'date', width: 12, fmt: 'dd.mm.yyyy' },
    { header: 'День', key: 'weekday', width: 7 },
    { header: 'Неделя', key: 'week', width: 9 },
    { header: 'Таймер, ч', key: 'timer', width: 11, fmt: HOURS },
    { header: 'Добавлено правками, ч', key: 'added', width: 13, fmt: HOURS },
    { header: 'Убрано правками, ч', key: 'removed', width: 13, fmt: HOURS },
    { header: 'Итого, ч', key: 'hours', width: 11, fmt: HOURS },
    { header: 'Норма, ч', key: 'norm', width: 10, fmt: HOURS },
    { header: 'Отклонение, ч', key: 'diff', width: 13, fmt: HOURS },
  ])
  const weekOf = new Map<string, string>()
  for (const w of r.weeks) for (const d of r.days) if (d.date >= w.from && d.date <= w.to) weekOf.set(d.date, w.label)
  for (const d of r.days) {
    const row = days.addRow({
      date: excelDate(d.date),
      weekday: d.weekday,
      week: weekOf.get(d.date) ?? '',
      timer: round2(d.timer),
      added: round2(d.added),
      removed: round2(d.removed),
      hours: round2(d.hours),
      norm: round2(d.norm),
      diff: round2(d.hours - d.norm),
    })
    if (d.weekend) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WEEKEND_FILL } }
      })
    }
    if (d.hours < 0) row.getCell('hours').font = { color: { argb: TERRA } }
  }
  const lastDay = days.rowCount
  filter(days, 9)
  if (lastDay > 1) {
    dataBar(days, `G2:G${lastDay}`)
    const total = days.addRow({ date: null, weekday: 'Итого' })
    total.font = { bold: true }
    // результат записан рядом с формулой: просмотрщики без пересчёта (Быстрый просмотр
    // на iPhone) иначе показали бы пустую строку итогов
    const sums: Record<string, number> = {
      D: r.days.reduce((a, d) => a + d.timer, 0),
      E: r.days.reduce((a, d) => a + d.added, 0),
      F: r.days.reduce((a, d) => a + d.removed, 0),
      G: r.days.reduce((a, d) => a + d.hours, 0),
      H: r.days.reduce((a, d) => a + d.norm, 0),
      I: r.days.reduce((a, d) => a + d.hours - d.norm, 0),
    }
    for (const [key, result] of Object.entries(sums)) {
      total.getCell(key).value = { formula: `SUM(${key}2:${key}${lastDay})`, result: round2(result) }
      total.getCell(key).numFmt = HOURS
    }
  }

  /* ── Первая группа ─────────────────────────────────────────── */
  // имена листов — из названий групп; Excel не принимает в них : \ / ? * [ ] и повторы
  const taken = new Set(['Обзор', 'По дням', 'Спринты', 'Журнал', 'Записи'])
  const sheetName = (name: string) => {
    const base = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Группа'
    let out = base
    for (let i = 2; taken.has(out); i++) out = `${base} ${i}`
    taken.add(out)
    return out
  }
  if (r.outer) {
    const dirCols: Col[] = [
      { header: r.outer.item, key: 'name', width: 24 },
      { header: `${curCol}, ч`, key: 'hours', width: 13, fmt: HOURS },
      { header: 'Доля', key: 'share', width: 9, fmt: '0%' },
      { header: `${prevCol}, ч`, key: 'prev', width: 13, fmt: HOURS },
      { header: 'Доля тогда', key: 'prevShare', width: 11, fmt: '0%' },
      { header: 'Разница, ч', key: 'diff', width: 11, fmt: HOURS },
    ]
    if (r.inner) dirCols.push({ header: r.inner.name, key: 'children', width: 12 })
    const dirs = sheet(wb, sheetName(r.outer.name), dirCols)
    for (const d of r.directions) {
      dirs.addRow({
        name: d.name,
        hours: round2(d.hours),
        share: d.share,
        prev: round2(d.prevHours),
        prevShare: d.prevShare,
        diff: round2(d.hours - d.prevHours),
        ...(r.inner ? { children: d.childCount } : {}),
      })
    }
    filter(dirs, dirCols.length)
    if (dirs.rowCount > 1) dataBar(dirs, `B2:B${dirs.rowCount}`)
  }

  /* ── Вторая группа внутри первой ───────────────────────────── */
  if (r.outer && r.inner) {
  const projects = sheet(wb, sheetName(r.inner.name), [
    { header: r.outer.item, key: 'section', width: 22 },
    { header: r.inner.item, key: 'name', width: 24 },
    { header: `${curCol}, ч`, key: 'hours', width: 13, fmt: HOURS },
    { header: 'Доля', key: 'share', width: 9, fmt: '0%' },
    { header: `${prevCol}, ч`, key: 'prev', width: 13, fmt: HOURS },
    { header: 'Разница, ч', key: 'diff', width: 11, fmt: HOURS },
    { header: 'Изменение', key: 'change', width: 12 },
  ])
  for (const g of r.groups) {
    for (const p of g.rows) {
      const row = projects.addRow({
        section: g.name,
        name: p.name,
        hours: round2(p.hours),
        share: r.total > 0 ? p.hours / r.total : 0,
        prev: round2(p.prevHours),
        diff: round2(p.hours - p.prevHours),
        change: p.prevHours <= 0.004 && p.hours > 0.004 ? 'новый' : p.hours <= 0.004 && p.prevHours > 0.004 ? 'выпал' : '',
      })
      if (row.getCell('change').value === 'выпал') row.font = { color: { argb: MUTED } }
    }
  }
  filter(projects, 7)
  if (projects.rowCount > 1) dataBar(projects, `C2:C${projects.rowCount}`)
  }

  /* ── Спринты ───────────────────────────────────────────────── */
  const groupName = { over: 'Вышли за план', inplan: 'В плане', noplan: 'Без плана' }
  // колонки групп — только тех, что есть
  const dimCols = (): Col[] => [
    ...(r.inner ? [{ header: r.inner.item, key: 'inner', width: 18 }] : []),
    ...(r.outer ? [{ header: r.outer.item, key: 'outer', width: 20 }] : []),
  ]
  const sprintCols: Col[] = [
    { header: 'Итог', key: 'group', width: 15 },
    { header: 'Спринт', key: 'name', width: 30 },
    ...dimCols(),
    { header: 'План, ч', key: 'plan', width: 9, fmt: HOURS },
    { header: 'Факт за всё время, ч', key: 'factTotal', width: 13, fmt: HOURS },
    { header: '% плана', key: 'pct', width: 9, fmt: '0%' },
    { header: 'Сверх плана, ч', key: 'over', width: 11, fmt: HOURS },
    { header: 'Факт за период, ч', key: 'factPeriod', width: 12, fmt: HOURS },
    { header: 'Статус', key: 'status', width: 14 },
    { header: 'Срок с', key: 'start', width: 11, fmt: 'dd.mm.yyyy' },
    { header: 'Срок до', key: 'end', width: 11, fmt: 'dd.mm.yyyy' },
    { header: 'Срок прошёл', key: 'overdue', width: 11 },
  ]
  const sprints = sheet(wb, 'Спринты', sprintCols)
  for (const s of r.sprints) {
    const row = sprints.addRow({
      group: groupName[s.group],
      name: s.name,
      inner: s.inner,
      outer: s.outer,
      plan: s.plan > 0 ? round2(s.plan) : null,
      factTotal: round2(s.factTotal),
      pct: s.pct !== null ? s.pct / 100 : null,
      over: s.over > 0 ? round2(s.over) : null,
      factPeriod: round2(s.factPeriod),
      status: s.status,
      start: excelDate(s.startDate),
      end: excelDate(s.endDate),
      overdue: s.overdue ? 'да' : '',
    })
    if (s.group === 'over') {
      row.getCell('pct').font = { color: { argb: TERRA } }
      row.getCell('over').font = { color: { argb: TERRA } }
    }
    if (s.overdue) row.getCell('overdue').font = { color: { argb: TERRA } }
    if (s.isFinal) row.getCell('status').font = { color: { argb: GREEN } }
  }
  filter(sprints, sprintCols.length)
  // «Факт за период» сдвигается вместе с колонками групп
  const factCol = sprints.getColumn('factPeriod').letter
  if (sprints.rowCount > 1) dataBar(sprints, `${factCol}2:${factCol}${sprints.rowCount}`)

  /* ── Журнал ────────────────────────────────────────────────── */
  const withComments = r.options.includeComments
  const journalCols: Col[] = [
    { header: 'Дата', key: 'date', width: 12, fmt: 'dd.mm.yyyy' },
    { header: 'День', key: 'weekday', width: 7 },
    { header: 'Задача', key: 'title', width: 40 },
    ...dimCols(),
    { header: 'Часы', key: 'hours', width: 9, fmt: HOURS },
  ]
  if (withComments) journalCols.push({ header: 'Комментарии', key: 'comments', width: 60 })
  const journal = sheet(wb, 'Журнал', journalCols)
  for (const day of r.journal) {
    for (const row of day.rows) {
      const added = journal.addRow({
        date: excelDate(day.date),
        weekday: day.weekday,
        title: row.title,
        inner: row.inner,
        outer: row.outer,
        hours: round2(row.hours),
        ...(withComments ? { comments: row.comments.join(' · ') } : {}),
      })
      if (withComments) added.getCell('comments').alignment = { wrapText: true, vertical: 'top' }
    }
  }
  filter(journal, journalCols.length)

  /* ── Записи: каждая запись строкой — для сводных таблиц ────── */
  const records = wb.addWorksheet('Записи', { views: [{ state: 'frozen', ySplit: 1 }] })
  // имена колонок таблицы должны быть разными — группа «Часы» не должна сломать файл
  const fixed = new Set(['Дата', 'Неделя', 'День', 'Спринт', 'Подзадача', 'Часы', 'Источник', 'Начало', 'Конец'])
  const groupCols = r.groupNames.map((name) => {
    let out = name.trim() || 'Группа'
    while (fixed.has(out)) out = `${out} (группа)`
    fixed.add(out)
    return { name: out, width: 20 }
  })
  const recordCols: { name: string; width: number; fmt?: string }[] = [
    { name: 'Дата', width: 12, fmt: 'dd.mm.yyyy' },
    { name: 'Неделя', width: 9 },
    { name: 'День', width: 7 },
    ...groupCols,
    { name: 'Спринт', width: 30 },
    { name: 'Подзадача', width: 26 },
    { name: 'Часы', width: 9, fmt: HOURS },
    { name: 'Источник', width: 11 },
    { name: 'Начало', width: 9 },
    { name: 'Конец', width: 9 },
  ]
  recordCols.forEach((c, i) => {
    records.getColumn(i + 1).width = c.width
    if (c.fmt) records.getColumn(i + 1).numFmt = c.fmt
  })
  records.addTable({
    name: 'Zapisi',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleLight1', showRowStripes: true },
    columns: recordCols.map((c) => ({ name: c.name, filterButton: true })),
    rows: r.records.length
      ? r.records.map((e) => [
          excelDate(e.date),
          e.week,
          e.weekday,
          ...e.dims,
          e.sprint,
          e.subtask,
          round2(e.hours),
          e.source,
          e.start,
          e.end,
        ])
      : [recordCols.map(() => null)],
  })
  records.getRow(1).height = 22
  // формат столбцов таблица не наследует — проставляем ячейкам явно
  const hoursCol = records.getColumn(recordCols.findIndex((c) => c.name === 'Часы') + 1).letter
  for (let i = 2; i <= records.rowCount; i++) {
    records.getCell(`A${i}`).numFmt = 'dd.mm.yyyy'
    records.getCell(`${hoursCol}${i}`).numFmt = HOURS
  }
  return wb
}

export async function exportExcel(r: ReportData) {
  const buffer = await buildWorkbook(r).xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, `Отчёт_${r.from}_${r.to}.xlsx`)
}
