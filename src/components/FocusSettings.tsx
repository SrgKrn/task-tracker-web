import { Chip, Segmented } from './ui'
import { FOCUS_CHANGES, FOCUS_INFO } from '../lib/focus'
import { useFocusPrefs } from '../lib/queries/focus'
import { describeError, useToast } from '../lib/Toast'
import { useSaveSettingsPatch } from '../lib/queries/userSettings'
import type { FocusMode, FocusSettings } from '../lib/types'

function Choice({ label, value, options, unit = 'мин', onChange }: {
  label: string
  value: number
  options: number[]
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o} active={o === value} onClick={() => onChange(o)}>
            {o}
            {unit ? ` ${unit}` : ''}
          </Chip>
        ))}
      </div>
    </div>
  )
}

/** Режим и длительности — сохраняются сразу; на идущую сессию не влияют, только на следующую. */
export function FocusSettingsForm() {
  const { mode, settings } = useFocusPrefs()
  const save = useSaveSettingsPatch()
  const { showError } = useToast()
  const onError = (e: unknown) => showError(describeError(e))
  const setSettings = (next: FocusSettings) => save.mutate({ focus_settings: next }, { onError })
  const p = settings.pomodoro
  const d = settings.deep

  return (
    <div className="flex flex-col gap-4">
      <Segmented<FocusMode>
        stretch
        value={mode}
        onChange={(m) => save.mutate({ focus_mode: m }, { onError })}
        options={[
          { value: 'pomodoro', label: 'Pomodoro' },
          { value: '9030', label: '90/30' },
        ]}
      />
      {mode === 'pomodoro' ? (
        <>
          <Choice label="Работа" value={p.work} options={[15, 20, 25, 30, 45, 50]} onChange={(v) => setSettings({ ...settings, pomodoro: { ...p, work: v } })} />
          <Choice label="Короткий перерыв" value={p.short} options={[3, 5, 10]} onChange={(v) => setSettings({ ...settings, pomodoro: { ...p, short: v } })} />
          <Choice label="Длинный перерыв" value={p.long} options={[15, 20, 30]} onChange={(v) => setSettings({ ...settings, pomodoro: { ...p, long: v } })} />
          <Choice
            label="Помидоров до длинного перерыва"
            value={p.cycles}
            options={[3, 4, 5]}
            unit=""
            onChange={(v) => setSettings({ ...settings, pomodoro: { ...p, cycles: v } })}
          />
        </>
      ) : (
        <>
          <Choice label="Глубокая работа" value={d.work} options={[60, 75, 90, 120]} onChange={(v) => setSettings({ ...settings, deep: { ...d, work: v } })} />
          <Choice label="Отдых" value={d.rest} options={[20, 30]} onChange={(v) => setSettings({ ...settings, deep: { ...d, rest: v } })} />
        </>
      )}
      <p className="text-sm text-text-secondary">Новые длительности — со следующей сессии; идущая доработает по старым.</p>
    </div>
  )
}

/** Суть режима: откуда, как работает, кому подходит и что делает приложение. */
export function FocusExplainer({ mode }: { mode: FocusMode }) {
  const info = FOCUS_INFO[mode]
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-tertiary">{info.origin}</p>
      <p className="text-base text-text">{info.lead}</p>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-text-secondary">Как работает</span>
        <ol className="flex flex-col gap-2">
          {info.steps.map(([mark, text]) => (
            <li key={mark} className="flex items-start gap-2.5 text-base text-text">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-surface-sunken font-mono text-xs font-medium text-text-secondary">
                {mark}
              </span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="rounded-md bg-accent-soft px-3 py-2.5 text-sm text-accent-text">
        <b className="font-semibold">Подходит, если:</b> {info.fits}
      </p>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-text-secondary">Как это устроено в Semternity</span>
        <ul className="flex flex-col gap-1.5">
          {FOCUS_CHANGES.map((c) => (
            <li key={c} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
