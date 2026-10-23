import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import { PRESET_ICON } from '../components/PresetPreview'
import { ArrowLeft, ChevronRight } from '../components/Icon'
import { Button, ListGroup, Overline } from '../components/ui'
import { switchWorkspace, useWorkspaces } from '../lib/workspace'
import { useAuth } from '../lib/AuthContext'
import { BLANK_PRESET, PRESETS, presetPayload, type Preset } from '../lib/presets'
import { useApplyPreset } from '../lib/queries/userSettings'
import { describeError, useToast } from '../lib/Toast'
import { RoomNote, useRoom } from '../components/Upgrade'

/** название пространства по заготовке — сменить можно в «Профиль → Пространства» */
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
 * Первый запуск (0.43): один экран. «Начать» — пустой лист без групп, нормы и методики;
 * ниже заготовки, касание сразу создаёт пространство. Раньше был второй шаг с методикой,
 * фокусом, нормой и примерами — новичку там не на что было опереться; теперь о каждой
 * функции рассказывает подсказка, когда человек до неё дойдёт.
 */
export function Welcome({ mode = 'first' }: { mode?: 'first' | 'new' }) {
  const isNew = mode === 'new'
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const apply = useApplyPreset()
  const qc = useQueryClient()
  const { showError } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const { data: workspaces = [] } = useWorkspaces()
  // лимит пространств — только для «Новое пространство»; первое есть у всех
  const room = useRoom('workspaces', isNew ? workspaces.filter((w) => !w.archived_at).length : 0)

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  const blocked = isNew && !room.allowed

  function start(preset: Preset) {
    if (busy || blocked) return
    setBusy(preset.code)
    apply.mutate(
      {
        preset: presetPayload(preset),
        options: {
          examples: false,
          settings: true,
          stages: true,
          onboard: !isNew,
          name: SPACE_NAME[preset.code] ?? preset.title,
          code: preset.code,
          color: `label-${(workspaces.length % 8) + 1}`,
        },
        // null — новое пространство; у нового пользователя оно станет основным
        workspace: null,
      },
      {
        onError: (e) => {
          setBusy(null)
          showError(describeError(e))
        },
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

  return (
    <div className="safe-top-page mx-auto flex min-h-full max-w-lg flex-col gap-4 px-5 pt-6 pb-10">
      {isNew && (
        <Button variant="ghost" className="-ml-3 self-start" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          Отмена
        </Button>
      )}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">
          {isNew ? 'Новое пространство' : 'Привет! Начнём с пустого списка'}
        </h1>
        <p className="text-base text-text-secondary">
          {isNew
            ? 'У пространства свои задачи, группы, этапы и учёт. Начните с пустого или возьмите заготовку.'
            : 'Создайте задачу и запустите учёт. Остальное покажем по ходу, когда понадобится.'}
        </p>
      </div>
      {isNew && <RoomNote room={room} what="Ещё одно пространство" max="Это максимум пространств." />}

      <Button variant="primary" size="lg" loading={busy === 'blank'} disabled={blocked || (!!busy && busy !== 'blank')} onClick={() => start(BLANK_PRESET)}>
        {isNew ? 'Пустое пространство' : 'Начать'}
      </Button>

      <div className="flex flex-col gap-2">
        <Overline className="px-0.5">Или заготовка — её тоже можно менять</Overline>
        <ListGroup>
          {PRESETS.map((p) => {
            const Icon = PRESET_ICON[p.code]
            return (
              <button
                key={p.code}
                type="button"
                disabled={blocked || !!busy}
                onClick={() => start(p)}
                className="flex min-h-14 items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-sunken disabled:opacity-60 lg:hover:bg-surface-hover"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-secondary">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-text">{p.title}</span>
                  <span className="block text-sm text-text-secondary">{p.inside}</span>
                </span>
                {busy === p.code ? (
                  <span className="text-sm text-text-secondary">Создаю…</span>
                ) : (
                  <ChevronRight size={15} className="shrink-0 text-text-secondary" />
                )}
              </button>
            )
          })}
        </ListGroup>
      </div>
    </div>
  )
}
