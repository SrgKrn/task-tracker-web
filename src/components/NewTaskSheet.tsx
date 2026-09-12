import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChipPicker } from './ChipPicker'
import { DurationSheet } from './DurationSheet'
import { FieldLabel } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { useCreateProject, useProjects } from '../lib/queries/projects'
import { useCreateSection, useSections } from '../lib/queries/sections'
import { useCreateTask } from '../lib/queries/tasks'
import { useStartTimer } from '../lib/queries/timer'
import { formatHoursMinutes } from '../lib/time'

/** Быстрое создание задачи: название, раздел, проект, план — и сразу старт учёта. */
export function NewTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: allSections = [] } = useSections()
  const { data: allProjects = [] } = useProjects()
  // новые задачи в архивные разделы/проекты не заводим
  const sections = useMemo(() => allSections.filter((s) => !s.archived), [allSections])
  const projects = useMemo(() => allProjects.filter((p) => !p.archived), [allProjects])
  const createTask = useCreateTask()
  const createSection = useCreateSection()
  const createProject = useCreateProject()
  const startTimer = useStartTimer()
  const { showError } = useToast()

  const [title, setTitle] = useState('')
  const [plan, setPlan] = useState(1)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [editingPlan, setEditingPlan] = useState(false)

  // сброс только на открытии листа. Если завязать эффект ещё и на списки, то
  // создание раздела прямо отсюда обновляло бы список и тут же сбрасывало выбор
  // обратно на первый элемент — свежесозданный выбрать было бы невозможно
  useEffect(() => {
    if (!open) return
    setTitle('')
    setPlan(1)
    setSectionId(null)
    setProjectId(null)
    setEditingPlan(false)
  }, [open])

  if (!open) return null

  // пока пользователь не выбрал сам, подставляем первый доступный
  const effectiveSectionId = sectionId ?? sections[0]?.id ?? null
  const effectiveProjectId = projectId ?? projects[0]?.id ?? null
  const canCreate = !!title.trim() && !!effectiveSectionId && !!effectiveProjectId

  function create(andStart: boolean) {
    if (!canCreate || !effectiveSectionId || !effectiveProjectId) return
    createTask.mutate(
      {
        name: title.trim(),
        project_id: effectiveProjectId,
        section_id: effectiveSectionId,
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
        <h3 className="text-lg font-semibold leading-[1.2] text-slate-100">Новая задача</h3>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что нужно сделать"
          className="h-[46px] rounded-[14px] px-3.5 text-base text-slate-100 placeholder:text-[#83838c]"
          style={{ background: '#0f0f13', border: '1px solid var(--s-border-strong)' }}
        />

        {/* раздел и проект заводятся прямо здесь: раньше при пустом справочнике
            лист просто отказывался работать и отправлял в «Ещё» */}
        <ChipPicker
          label="Раздел"
          items={sections}
          value={effectiveSectionId}
          onChange={setSectionId}
          placeholder="Название раздела"
          onCreate={(name, onCreated) =>
            createSection.mutate(name, {
              onError: (e) => showError(describeError(e)),
              onSuccess: (row) => onCreated(row.id),
            })
          }
        />

        <ChipPicker
          label="Проект"
          items={projects}
          value={effectiveProjectId}
          onChange={setProjectId}
          placeholder="Название проекта"
          onCreate={(name, onCreated) =>
            createProject.mutate(name, {
              onError: (e) => showError(describeError(e)),
              onSuccess: (row) => onCreated(row.id),
            })
          }
        />

        <div className="flex items-center justify-between gap-3">
          <FieldLabel>План</FieldLabel>
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => setPlan((v) => Math.max(0.25, v - 0.25))}
              aria-label="Убавить 15 минут"
              className="hit-44 flex h-[34px] w-[34px] items-center justify-center rounded-full text-base text-slate-300"
              style={{ border: '1px solid var(--s-border-strong-2)' }}
            >
              −
            </button>
            {/* по цифре открывается ввод: шагами по 15 минут набирать «3 ч 40 мин» долго */}
            <button
              type="button"
              onClick={() => setEditingPlan(true)}
              className="tabular min-w-[92px] rounded-lg py-1 text-center font-mono text-lg font-semibold text-slate-100 underline decoration-dotted decoration-slate-600 underline-offset-4"
            >
              {formatHoursMinutes(plan)}
            </button>
            <button
              type="button"
              onClick={() => setPlan((v) => v + 0.25)}
              aria-label="Прибавить 15 минут"
              className="hit-44 flex h-[34px] w-[34px] items-center justify-center rounded-full text-base text-slate-300"
              style={{ border: '1px solid var(--s-border-strong-2)' }}
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-0.5 flex gap-[9px]">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-[15px] text-sm font-medium text-slate-300"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => create(true)}
            disabled={!canCreate}
            className="h-12 flex-[2] rounded-[15px] text-sm font-semibold"
            style={{
              background: canCreate ? 'var(--s-accent)' : '#232329',
              color: canCreate ? 'var(--s-on-accent)' : '#6e6e77',
            }}
          >
            Создать и начать
          </button>
        </div>

        {/* внутри содержимого листа, а не рядом: клик по подложке этого окна не должен
            всплыть до подложки листа и закрыть заодно и его */}
        <DurationSheet
          open={editingPlan}
          title="Плановое время"
          hours={plan}
          onCancel={() => setEditingPlan(false)}
          onSubmit={(value) => {
            setEditingPlan(false)
            setPlan(Math.max(0.25, value))
          }}
        />
      </div>
    </div>
  )
}
