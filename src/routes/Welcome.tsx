import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import { PRESET_ICON, PresetStructure, StageChips } from '../components/PresetPreview'
import { ArrowLeft } from '../components/Icon'
import { Button, ListGroup, Overline, Segmented, Switch, fieldClass } from '../components/ui'
import { switchWorkspace, useWorkspaces } from '../lib/workspace'
import { useAuth } from '../lib/AuthContext'
import { FOCUS_INFO } from '../lib/focus'
import { METHODS, METHOD_ORDER } from '../lib/priority'
import { BLANK_PRESET, PRESETS, presetByCode, presetPayload, type Preset } from '../lib/presets'
import { useApplyPreset } from '../lib/queries/userSettings'
import { describeError, useToast } from '../lib/Toast'
import { RoomNote, useRoom } from '../components/Upgrade'
import type { FocusMode, PriorityMethod } from '../lib/types'

/** короткое название пространства по пресету — его можно сменить на втором шаге */
const SPACE_NAME: Record<string, string> = {
  clients: 'Работа',
  team: 'Работа',
  study: 'Учёба',
  personal: 'Личное',
  project: 'Свой проект',
  sport: 'Спорт',
  blank: 'Основное',
}

/**
 * Первый запуск: для чего трекер. Пресет ставит группы со связями, этапы, норму, методику,
 * фокус и, по желанию, примеры задач — второй шаг показывает всё это до того, как что-то
 * создано. Потом всё правится как обычно.
 */
export function Welcome({ mode = 'first' }: { mode?: 'first' | 'new' }) {
  const isNew = mode === 'new'
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const apply = useApplyPreset()
  const qc = useQueryClient()
  const { showError } = useToast()
  const [code, setCode] = useState('clients')
  const [step, setStep] = useState<1 | 2>(1)
  const [method, setMethod] = useState<PriorityMethod | null>(null)
  const [focus, setFocus] = useState<FocusMode | null>(null)
  const [examples, setExamples] = useState(true)
  const [name, setName] = useState<string | null>(null)
  const { data: workspaces = [] } = useWorkspaces()
  // лимит пространств — только для «Новое пространство»; первое есть у всех
  const room = useRoom('workspaces', isNew ? workspaces.filter((w) => !w.archived_at).length : 0)

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  const preset = presetByCode(code)!
  const blank = code === 'blank'
  const chosenMethod = method ?? preset.settings.priority_method
  const chosenFocus = focus ?? preset.settings.focus_mode
  const spaceName = name ?? SPACE_NAME[code] ?? preset.title

  function choose(p: Preset) {
    setCode(p.code)
    setMethod(null)
    setFocus(null)
    setName(null)
  }

  function start() {
    apply.mutate(
      {
        preset: presetPayload(preset, { method: chosenMethod, focus: chosenFocus }),
        options: {
          examples: examples && !blank,
          settings: true,
          stages: true,
          onboard: !isNew,
          name: spaceName.trim() || SPACE_NAME[code],
          code,
          color: `label-${(workspaces.length % 8) + 1}`,
        },
        // null — новое пространство; у нового пользователя оно станет основным
        workspace: null,
      },
      {
        onError: (e) => showError(describeError(e)),
        // настройки и список пространств — перечитать до перехода: иначе проверка первого
        // запуска увидит старое «не пройдено» и вернёт сюда же
        onSuccess: async (r) => {
          await Promise.all([qc.refetchQueries({ queryKey: ['user_settings'] }), qc.refetchQueries({ queryKey: ['workspaces'] })])
          switchWorkspace(r.workspace, qc)
          navigate('/', { replace: true })
        },
      },
    )
  }

  const progress = (
    <span className="flex gap-1" aria-hidden>
      {[1, 2].map((i) => (
        <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border'}`} />
      ))}
    </span>
  )

  if (step === 1) {
    return (
      <div className="safe-top-page mx-auto flex min-h-full max-w-lg flex-col gap-4 px-5 pt-6 pb-10">
        {progress}
        {isNew && (
          <Button variant="ghost" className="-ml-3 self-start" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            Отмена
          </Button>
        )}
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">
            {isNew ? 'Новое пространство' : 'Для чего вам Semternity?'}
          </h1>
          <p className="text-base text-text-secondary">
            {isNew
              ? 'Для чего оно? У пространства свои группы, этапы, задачи, учёт, норма и методика.'
              : 'Подготовим группы, этапы и норму часов. Потом всё можно поменять.'}
          </p>
        </div>
        {isNew && <RoomNote room={room} what="Ещё одно пространство" max="Это максимум пространств." />}
        <div role="radiogroup" aria-label="Для чего трекер" className="flex flex-col gap-2">
          {[...PRESETS, BLANK_PRESET].map((p) => {
            const on = p.code === code
            const Icon = PRESET_ICON[p.code]
            return (
              <button
                key={p.code}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(p)}
                className={`flex items-center gap-3 rounded-md border-2 px-3.5 py-3 text-left ${
                  on ? 'border-accent bg-surface-selected' : `bg-surface ${p.code === 'blank' ? 'border-dashed border-border-strong' : 'border-border'}`
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                    on ? 'bg-accent text-on-accent' : 'bg-surface-sunken text-text-secondary'
                  }`}
                >
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-text">{p.title}</span>
                  <span className="block text-sm text-text-secondary">{p.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
        <Button variant="primary" size="lg" onClick={() => setStep(2)}>
          Дальше
        </Button>
      </div>
    )
  }

  return (
    <div className="safe-top-page mx-auto flex min-h-full max-w-lg flex-col gap-4 px-5 pt-6 pb-10">
      {progress}
      <Button variant="ghost" className="-ml-3 self-start" onClick={() => setStep(1)}>
        <ArrowLeft size={16} />
        Другой вариант
      </Button>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">{preset.title}</h1>
        <p className="text-base text-text-secondary">Вот что будет внутри — ничего ещё не создано</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <Overline>Название пространства</Overline>
        <input
          id="welcome-space-name"
          className={fieldClass}
          value={spaceName}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        {!isNew && <span className="text-sm text-text-secondary">Потом можно завести и другие — например, «Спорт» рядом с «Работой»</span>}
      </label>

      <PresetStructure preset={preset} examples={examples && !blank} />

      <div className="flex flex-col gap-2">
        <Overline>Этапы задач</Overline>
        <StageChips stages={preset.stages} />
      </div>

      <div className="flex flex-col gap-2">
        <Overline>Методика приоритизации</Overline>
        <select
          id="welcome-method"
          value={chosenMethod}
          onChange={(e) => setMethod(e.target.value as PriorityMethod)}
          className="h-[var(--tap)] rounded-sm border border-border bg-surface px-2.5 text-base text-text"
        >
          <option value="none">Без методики</option>
          {METHOD_ORDER.map((m) => (
            <option key={m} value={m}>
              {METHODS[m].name}
            </option>
          ))}
        </select>
        <span className="text-sm text-text-secondary">
          {chosenMethod === 'none' ? 'Обычный список дня' : METHODS[chosenMethod].short}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Overline>Фокус</Overline>
        <Segmented<FocusMode>
          stretch
          value={chosenFocus}
          onChange={setFocus}
          options={[
            { value: 'pomodoro', label: 'Pomodoro' },
            { value: '9030', label: '90/30' },
          ]}
        />
        <span className="text-sm text-text-secondary">{FOCUS_INFO[chosenFocus].short}</span>
      </div>

      <ListGroup>
        <div className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="text-base text-text">Норма</span>
          <span className="text-right text-sm text-text-secondary">{preset.normLabel}</span>
        </div>
        {!blank && (
          <div className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-base text-text">Примеры задач</span>
              <span className="block text-sm text-text-secondary">
                {preset.examples.map((e) => e.name).join(', ')} — чтобы экран не был пустым
              </span>
            </span>
            <Switch on={examples} onChange={setExamples} ariaLabel="Добавить примеры задач" />
          </div>
        )}
      </ListGroup>

      {preset.extras.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {preset.extras.map((x) => (
            <li key={x} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              {x}
            </li>
          ))}
        </ul>
      )}

      <Button variant="primary" size="lg" loading={apply.isPending} onClick={start}>
        {isNew ? 'Создать пространство' : 'Начать работу'}
      </Button>
    </div>
  )
}
