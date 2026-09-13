import { overlapsPeriod } from './period'
import type { Project, Section, Status, Task, TimeEntry } from './types'

export interface ReportTaskRow {
  name: string
  project: string
  section: string
  status: string
  planHours: number
  factHoursInRange: number
  startDate: string | null
  endDate: string | null
}

export interface ReportEntryRow {
  dateTime: string
  task: string
  project: string
  section: string
  durationHours: number
  type: string
}

export interface ReportData {
  from: string
  to: string
  totalFactHours: number
  totalPlanHours: number
  tasksClosed: number
  totalOverHours: number
  tasks: ReportTaskRow[]
  entries: ReportEntryRow[]
}

export function buildReportData(
  tasks: Task[],
  projects: Project[],
  sections: Section[],
  statuses: Status[],
  entries: TimeEntry[],
  from: string,
  to: string,
): ReportData {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  const statusById = new Map(statuses.map((s) => [s.id, s]))

  const taskById = new Map(tasks.map((t) => [t.id, t]))

  // минуты подзадачи идут в строку её спринта; план берём только у спринта — план
  // подзадач лишь раскладывает его, и сумма удвоила бы итог
  const factMinutesByTask = new Map<string, number>()
  for (const e of entries) {
    const task = taskById.get(e.task_id)
    const head = task?.parent_id ?? e.task_id
    factMinutesByTask.set(head, (factMinutesByTask.get(head) ?? 0) + e.duration_minutes)
  }

  const relevantTasks = tasks.filter(
    (t) => !t.parent_id && (overlapsPeriod(t, from, to) || factMinutesByTask.has(t.id)),
  )

  let totalOverHours = 0
  const taskRows: ReportTaskRow[] = relevantTasks.map((t) => {
    const factHoursInRange = (factMinutesByTask.get(t.id) ?? 0) / 60
    if (t.planned_hours > 0 && factHoursInRange > t.planned_hours) {
      totalOverHours += factHoursInRange - t.planned_hours
    }
    return {
      name: t.name,
      project: projectById.get(t.project_id)?.name ?? '',
      section: sectionById.get(t.section_id)?.name ?? '',
      status: t.status_id ? (statusById.get(t.status_id)?.label ?? '') : '',
      planHours: t.planned_hours,
      factHoursInRange,
      startDate: t.start_date,
      endDate: t.end_date,
    }
  })
  taskRows.sort((a, b) => b.factHoursInRange - a.factHoursInRange)

  const entryRows: ReportEntryRow[] = entries
    .map((e) => {
      const task = taskById.get(e.task_id)
      // день работы, а не момент сохранения: правка, сделанная сегодня за прошлую
      // неделю, должна стоять в отчёте той неделей
      const [y, m, d] = e.effective_date.split('-')
      return {
        dateTime: `${d}.${m}.${y}`,
        // «Спринт 7 / Созвон по интеграции» — иначе в выгрузке строка подзадачи ни к чему не привязана
        task: task
          ? task.parent_id
            ? `${taskById.get(task.parent_id)?.name ?? ''} / ${task.name}`
            : task.name
          : '',
        project: task ? (projectById.get(task.project_id)?.name ?? '') : '',
        section: task ? (sectionById.get(task.section_id)?.name ?? '') : '',
        durationHours: e.duration_minutes / 60,
        type: e.entry_type === 'timer' ? 'Трекинг' : 'Ручная правка',
        _sortKey: `${e.effective_date} ${e.created_at}`,
      }
    })
    .sort((a, b) => a._sortKey.localeCompare(b._sortKey))
    .map(({ _sortKey: _unused, ...rest }) => rest)

  const totalFactHours = entries.reduce((sum, e) => sum + e.duration_minutes, 0) / 60
  const totalPlanHours = relevantTasks
    .filter((t) => overlapsPeriod(t, from, to))
    .reduce((sum, t) => sum + t.planned_hours, 0)
  const tasksClosed = tasks.filter((t) => {
    if (!t.status_id || !statusById.get(t.status_id)?.is_final) return false
    return t.updated_at >= `${from}T00:00:00` && t.updated_at <= `${to}T23:59:59.999`
  }).length

  return { from, to, totalFactHours, totalPlanHours, tasksClosed, totalOverHours, tasks: taskRows, entries: entryRows }
}
