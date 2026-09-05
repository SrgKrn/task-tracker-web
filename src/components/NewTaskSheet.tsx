import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, FieldLabel } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useCreateTask } from '../lib/queries/tasks'
import { useStartTimer } from '../lib/queries/timer'
import { formatHoursRu } from '../lib/time'

/** Быстрое создание задачи: название, раздел, проект, план — и сразу старт учёта. */
export function NewTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: allSections = [] } = useSections()
  const { data: allProjects = [] } = useProjects()
  // новые задачи в архивные разделы/проекты не заводим
  const sections = useMemo(() => allSections.filter((s) => !s.archived), [allSections])
  const projects = useMemo(() => allProjects.filter((p) => !p.archived), [allProjects])
  const createTask = useCreateTask()
  const startTimer = useStartTimer()
  const { showError } = useToast()

  const [title, setTitle] = useState('')
  const [plan, setPlan] = useState(1)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setPlan(1)
    setSectionId(sections[0]?.id ?? null)
    setProjectId(projects[0]?.id ?? null)
  }, [open, sections, projects])

  if (!open) return null

  const canCreate = !!title.trim() && !!sectionId && !!projectId
  const missingRefs = sections.length === 0 || projects.length === 0

  function create(andStart: boolean) {
    if (!canCreate || !sectionId || !projectId) return
    createTask.mutate(
      {
        name: title.trim(),
        project_id: projectId,
        section_id: sectionId,
        status_id: null,
        planned_hours: plan,
        start_date: null,
        end_date: null,
      },
      {
        onError: (e) => showError(describeError(e)),
        onSuccess: (row) => {
          onClose()
          if (andStart) startTimer.mutate(row.id, { onError: (e) => showError(describeError(e)) })
          navigate(`/tasks/${row.id}`)
        },
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center"
      style={{ background: 'rgba(5,5,7,.62)' }}
      onClick={onClose}
    >
      <div
        className="flex w-full flex-col gap-3.5 px-5 pt-[18px] pb-[30px] lg:max-w-md lg:rounded-[28px] lg:pb-6"
        style={{
          background: 'var(--s-surface-2)',
          borderTop: '1px solid var(--s-border-strong)',
          borderRadius: '28px 28px 44px 44px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-[38px] rounded-full" style={{ background: 'var(--s-border-strong-2)' }} />
        <h3 className="text-[19px] font-semibold leading-[1.2] text-slate-100">Новая задача</h3>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что нужно сделать"
          className="h-[46px] rounded-[14px] px-3.5 text-[15px] text-slate-100 outline-none placeholder:text-[#6e6e77]"
          style={{ background: '#0f0f13', border: '1px solid var(--s-border-strong)' }}
        />

        {missingRefs ? (
          <p className="text-[13px] leading-[1.5] text-slate-600">
            Сначала создайте хотя бы один раздел и проект в «Ещё» — задача не может существовать без них.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Раздел</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((s) => (
                  <Chip key={s.id} active={sectionId === s.id} onClick={() => setSectionId(s.id)}>
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel>Проект</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => (
                  <Chip key={p.id} active={projectId === p.id} onClick={() => setProjectId(p.id)}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <FieldLabel>План, часов</FieldLabel>
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => setPlan((v) => Math.max(0.5, v - 0.5))}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-base text-slate-300"
                  style={{ border: '1px solid var(--s-border-strong-2)' }}
                >
                  −
                </button>
                <span className="tabular min-w-[44px] text-center font-mono text-[17px] font-semibold text-slate-100">
                  {formatHoursRu(plan)} ч
                </span>
                <button
                  type="button"
                  onClick={() => setPlan((v) => v + 0.5)}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-base text-slate-300"
                  style={{ border: '1px solid var(--s-border-strong-2)' }}
                >
                  +
                </button>
              </div>
            </div>
          </>
        )}

        <div className="mt-0.5 flex gap-[9px]">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-[15px] text-[14.5px] font-medium text-slate-300"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => create(true)}
            disabled={!canCreate}
            className="h-12 flex-[2] rounded-[15px] text-[14.5px] font-semibold"
            style={{
              background: canCreate ? 'var(--s-accent)' : '#232329',
              color: canCreate ? 'var(--s-on-accent)' : '#6e6e77',
            }}
          >
            Создать и начать
          </button>
        </div>
      </div>
    </div>
  )
}
