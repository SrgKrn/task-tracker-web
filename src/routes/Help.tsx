import { useState } from 'react'
import { ChevronRight } from '../components/Icon'
import { HelpSheet } from '../components/Tip'
import { ListGroup, Overline, Switch } from '../components/ui'
import { HELP, type HelpId } from '../lib/help'
import { TIP_IDS, TIPS } from '../lib/tips'
import { useResetTips, useSetTipsEnabled, useUserSettings } from '../lib/queries/userSettings'
import { describeError, useToast } from '../lib/Toast'
import { SettingsPage } from './Settings'

const SECTIONS = ['Начало', 'Порядок', 'Больше'] as const

/**
 * «Профиль → Справка» (0.43): все статьи разом — можно пройти всё, не дожидаясь подсказок.
 * «Новое» — статья, подсказку к которой человек ещё не видел. Внизу — подсказки вкл/выкл
 * и «Показать заново».
 */
export function HelpPage() {
  const { data: settings } = useUserSettings()
  const setEnabled = useSetTipsEnabled()
  const reset = useResetTips()
  const { showError, showSuccess } = useToast()
  const [open, setOpen] = useState<HelpId | null>(null)
  const seen = settings?.tips ?? {}
  const fresh = new Set(TIP_IDS.filter((id) => !(id in seen)).map((id) => TIPS[id].help))
  const enabled = settings?.tips_enabled !== false

  return (
    <SettingsPage title="Справка">
      <p className="-mt-1 text-base text-text-secondary">
        Коротко о каждой функции. Подсказки сами появляются рядом с кнопками, когда вы до них доходите.
      </p>
      {SECTIONS.map((section) => (
        <section key={section} className="flex flex-col gap-2">
          <Overline className="px-0.5">{section}</Overline>
          <ListGroup>
            {HELP.filter((a) => a.section === section).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpen(a.id)}
                className="flex min-h-13 items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-sunken lg:hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-text">{a.title}</span>
                  <span className="block truncate text-sm text-text-secondary">{a.intro}</span>
                </span>
                {fresh.has(a.id) && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-text">новое</span>
                )}
                <ChevronRight size={15} className="shrink-0 text-text-secondary" />
              </button>
            ))}
          </ListGroup>
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <Overline className="px-0.5">Подсказки</Overline>
        <ListGroup>
          <div className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-base text-text">Показывать подсказки</span>
              <span className="block text-sm text-text-secondary">Рядом с функцией, когда вы до неё дошли</span>
            </span>
            <Switch
              on={enabled}
              onChange={(v) => setEnabled.mutate(v, { onError: (e) => showError(describeError(e)) })}
              ariaLabel="Показывать подсказки"
            />
          </div>
          <button
            type="button"
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(undefined, {
                onError: (e) => showError(describeError(e)),
                onSuccess: () => showSuccess('Подсказки покажутся снова'),
              })
            }
            className="flex min-h-13 items-center px-3.5 py-2.5 text-left text-base font-medium text-accent-text active:bg-surface-sunken disabled:opacity-60 lg:hover:bg-surface-hover"
          >
            Показать подсказки заново
          </button>
        </ListGroup>
      </section>

      <HelpSheet id={open} onChange={setOpen} />
    </SettingsPage>
  )
}
