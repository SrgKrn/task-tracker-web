import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from '../components/Icon'
import { Overline } from '../components/ui'
import { CHANGE_LABEL, LATEST_RELEASE, RELEASES, type ChangeKind } from '../lib/changelog'
import { useMarkReleaseSeen, useUserSettings } from '../lib/queries/userSettings'

const KIND_STYLE: Record<ChangeKind, { background: string; color: string }> = {
  new: { background: 'var(--s-accent-ghost)', color: 'var(--s-accent-text)' },
  changed: { background: 'var(--s-tag)', color: 'var(--s-text-soft)' },
  fixed: { background: 'var(--s-success-ghost)', color: 'var(--s-success-text)' },
}

function releaseDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** «Ещё → История изменений»: что поменялось в каждой версии и где это найти. */
export function Changelog() {
  const navigate = useNavigate()
  const { data: settings, isFetched } = useUserSettings()
  const markSeen = useMarkReleaseSeen()

  // открыли страницу — уведомление о новой версии больше не нужно
  useEffect(() => {
    if (isFetched && settings?.seen_release !== LATEST_RELEASE.version) markSeen.mutate(LATEST_RELEASE.version)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched, settings?.seen_release])

  return (
    <div className="safe-top mx-auto flex max-w-lg flex-col px-5 pt-3.5 pb-10 lg:mx-0 lg:max-w-2xl">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/settings'))}
        className="-my-2.5 mb-1.5 flex items-center gap-2 self-start py-2.5 text-sm text-slate-400"
      >
        <ArrowLeft size={15} />
        Назад
      </button>
      <h1 className="text-2xl font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">История изменений</h1>

      {RELEASES.map((release, ri) => (
        <section key={release.version} className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Overline>Версия {release.version}</Overline>
              {ri === 0 && (
                <span
                  className="rounded-md px-1.5 py-[2px] font-mono text-2xs font-medium"
                  style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
                >
                  сейчас
                </span>
              )}
              <span className="ml-auto font-mono text-2xs text-slate-500">{releaseDate(release.date)}</span>
            </div>
            <h2 className="text-lg font-semibold leading-[1.25] text-slate-100" style={{ textWrap: 'balance' }}>
              {release.title}
            </h2>
          </div>

          <div className="flex flex-col gap-[9px]">
            {release.changes.map((c) => (
              <article
                key={c.title}
                className="flex flex-col gap-1.5 rounded-2xl p-3.5"
                style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold leading-[1.35] text-slate-100">{c.title}</h3>
                  <span
                    className="shrink-0 rounded-md px-2 py-[3px] text-2xs font-medium"
                    style={KIND_STYLE[c.kind]}
                  >
                    {CHANGE_LABEL[c.kind]}
                  </span>
                </div>
                <p className="text-xs leading-[1.55] text-slate-400">{c.text}</p>
                {c.where && <p className="font-mono text-2xs leading-[1.45] text-slate-500">Где: {c.where}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
