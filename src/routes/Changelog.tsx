import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown } from '../components/Icon'
import { Overline } from '../components/ui'
import { CHANGE_LABEL, LATEST_RELEASE, RELEASES, type ChangeKind } from '../lib/changelog'
import { useMarkReleaseSeen, useUserSettings } from '../lib/queries/userSettings'

const KIND_STYLE: Record<ChangeKind, { background: string; color: string }> = {
  new: { background: 'var(--accent-soft)', color: 'var(--accent-text)' },
  changed: { background: 'var(--surface-sunken)', color: 'var(--text-secondary)' },
  fixed: { background: 'var(--success-soft)', color: 'var(--success-text)' },
}

function releaseDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** «Ещё → История изменений»: что поменялось в каждой версии и где это найти. */
export function Changelog() {
  const navigate = useNavigate()
  const { data: settings, isFetched } = useUserSettings()
  const markSeen = useMarkReleaseSeen()
  // список длинный: открыта только последняя версия, остальные — по нажатию на заголовок
  const [open, setOpen] = useState<Set<string>>(() => new Set([LATEST_RELEASE.version]))
  const toggle = (version: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })

  // открыли страницу — уведомление о новой версии больше не нужно
  useEffect(() => {
    if (isFetched && settings?.seen_release !== LATEST_RELEASE.version) markSeen.mutate(LATEST_RELEASE.version)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched, settings?.seen_release])

  return (
    <div className="safe-top-page page mx-auto flex max-w-lg flex-col px-5 pt-3.5 pb-10">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/settings'))}
        className="-my-2.5 mb-1.5 flex items-center gap-2 self-start py-2.5 text-base text-text-secondary lg:hidden"
      >
        <ArrowLeft size={15} />
        Назад
      </button>
      <h1 className="text-xl font-semibold leading-[1.1] tracking-[-.02em] text-text">История изменений</h1>

      {RELEASES.map((release, ri) => {
        const expanded = open.has(release.version)
        return (
        <section key={release.version} className={`flex flex-col gap-3 ${ri === 0 ? 'mt-6' : 'mt-4'}`}>
          <button
            type="button"
            onClick={() => toggle(release.version)}
            aria-expanded={expanded}
            className="flex w-full flex-col gap-1 text-left"
          >
            <span className="flex w-full items-center gap-2">
              <Overline>Версия {release.version}</Overline>
              {ri === 0 && (
                <span
                  className="rounded-sm px-1.5 py-[2px] font-mono text-xs font-medium"
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                >
                  сейчас
                </span>
              )}
              <span className="ml-auto font-mono text-xs text-text-secondary">{releaseDate(release.date)}</span>
            </span>
            <span role="heading" aria-level={2} className="block text-lg font-semibold leading-[1.25] text-text" style={{ textWrap: 'balance' }}>
              <span className="flex items-start justify-between gap-3">
                {release.title}
                <ChevronDown
                  size={16}
                  className={`mt-1 shrink-0 text-text-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </span>
            </span>
          </button>

          {expanded && (
          <div className="flex flex-col gap-[9px]">
            {release.changes.map((c) => (
              <article
                key={c.title}
                className="flex flex-col gap-1.5 rounded-md p-3.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold leading-[1.35] text-text">{c.title}</h3>
                  <span
                    className="shrink-0 rounded-sm px-2 py-[3px] text-xs font-medium"
                    style={KIND_STYLE[c.kind]}
                  >
                    {CHANGE_LABEL[c.kind]}
                  </span>
                </div>
                <p className="text-sm leading-[1.55] text-text-secondary">{c.text}</p>
                {c.where && <p className="text-sm leading-[1.45] text-text-secondary">Где: {c.where}</p>}
              </article>
            ))}
          </div>
          )}
        </section>
        )
      })}
    </div>
  )
}
