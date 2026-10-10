import { useState } from 'react'
import { Toggle } from './AppPreferences'
import { describeError, useToast } from '../lib/Toast'
import { pickFromDrive, useGoogleActions, useGoogleStatus, type GoogleService } from '../lib/google'
import { useCalendarActions, useCalendarSources, useSetMeetingReminders } from '../lib/queries/calendar'
import { useSaveDriveReportsFolder, useUserSettings } from '../lib/queries/userSettings'
import type { CalendarSource } from '../lib/types'

const card = { background: 'var(--s-surface)', border: '1px solid var(--s-border)' }
const outline = { border: '1px solid var(--s-border-strong-2)' }
const accent = { background: 'var(--s-accent)', color: 'var(--s-on-accent)' }

function when(iso: string | null): string {
  if (!iso) return 'ещё не обновлялся'
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return `обновлён ${today ? 'сегодня' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

/** Вход в Google — переадресацией; пока сервер готовит ссылку, кнопка занята. */
function useGoogleSignIn() {
  const actions = useGoogleActions()
  const { showError } = useToast()
  const [busy, setBusy] = useState(false)
  async function signIn(service: GoogleService) {
    setBusy(true)
    try {
      await actions.signIn(service)
    } catch (e) {
      showError(describeError(e))
      setBusy(false)
    }
  }
  return { signIn, busy }
}

/* ── Google Календарь ──────────────────────────────────────────── */

/** Подключённый календарь: когда обновлялся, ошибка, «Обновить» и «Отключить». */
function SourceRow({ src, title, onReconnect }: { src: CalendarSource; title: string; onReconnect?: () => void }) {
  const actions = useCalendarActions()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))
  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-hairline)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-slate-100">{title}</span>
        <span className="shrink-0 font-mono text-2xs text-slate-500">{when(src.last_synced_at)}</span>
      </div>
      {src.last_error && <span className="text-2xs leading-[1.45] text-terra-400">{src.last_error}</span>}
      {src.last_error && onReconnect && (
        <button type="button" onClick={onReconnect} className="self-start text-xs text-brass-600">
          Войти через Google заново
        </button>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={actions.sync.isPending}
          onClick={() =>
            actions.sync.mutate(undefined, {
              onError,
              onSuccess: (r) =>
                r.errors.length ? showError(r.errors[0]) : showSuccess(`Обновлено: встреч на неделе — ${r.events}`),
            })
          }
          className="h-9 flex-1 rounded-[11px] text-xs font-medium text-slate-300 disabled:opacity-50"
          style={outline}
        >
          {actions.sync.isPending ? 'Обновляем…' : 'Обновить сейчас'}
        </button>
        <button
          type="button"
          onClick={() => actions.remove.mutate(src.id, { onError, onSuccess: () => showSuccess('Календарь отключён') })}
          className="h-9 rounded-[11px] px-3 text-xs font-medium text-slate-400"
          style={outline}
        >
          Отключить
        </button>
      </div>
    </div>
  )
}

/**
 * Календарь. Основной способ — вход через Google: сервер читает встречи основного календаря
 * через API, разрешение только на просмотр. Любой другой календарь (Outlook, Яндекс, iCloud) —
 * по секретной iCal-ссылке. Прошедшие встречи засчитываются в учёт с «Сегодня» и из вечерней
 * сводки Telegram.
 */
export function CalendarCard() {
  const { data: sources = [], isLoading } = useCalendarSources()
  const { data: google } = useGoogleStatus()
  const { data: settings } = useUserSettings()
  const actions = useCalendarActions()
  const setReminders = useSetMeetingReminders()
  const { signIn, busy } = useGoogleSignIn()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [feedUrl, setFeedUrl] = useState<string | null>(null)

  const googleSource = sources.find((s) => s.kind === 'google')
  const others = sources.filter((s) => s.kind !== 'google')
  const googleReady = !!google?.configured
  // вход через Google на сервере не настроен — iCal-ссылка остаётся единственным способом
  const showForm = adding || (!isLoading && google !== undefined && !googleReady && others.length === 0)

  function connect() {
    if (!url.trim()) return
    actions.add.mutate(url.trim(), {
      onError,
      onSuccess: (r) => {
        setUrl('')
        setAdding(false)
        if (r.error) showError(r.error)
        else showSuccess(r.events ? `Календарь подключён: встреч на неделе — ${r.events}` : 'Календарь подключён')
      },
    })
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={card}>
        <span className="text-2xs leading-[1.5] text-slate-500">
          Встречи появятся на «Сегодня»: прошедшие засчитываются в учёт одной кнопкой, а в начале встречи
          придёт напоминание начать учёт. Какую задачу вы выбрали для встречи, приложение запомнит.
        </span>

        {googleSource ? (
          <SourceRow
            src={googleSource}
            title={`Google Календарь${googleSource.name ? ` · ${googleSource.name}` : ''}`}
            onReconnect={googleReady ? () => signIn('calendar') : undefined}
          />
        ) : googleReady && google?.linked?.calendar ? (
          // вход с разрешением на календарь есть, а показ встреч отключали — вернуть без входа
          <button
            type="button"
            disabled={actions.addGoogle.isPending}
            onClick={() =>
              actions.addGoogle.mutate(undefined, {
                onError,
                onSuccess: (r) =>
                  r.error ? showError(r.error) : showSuccess(`Google Календарь подключён: встреч на неделе — ${r.events}`),
              })
            }
            className="h-11 rounded-[14px] text-sm font-semibold disabled:opacity-50"
            style={accent}
          >
            {actions.addGoogle.isPending ? 'Подключаем…' : `Показывать встречи из ${google.linked.email || 'Google Календаря'}`}
          </button>
        ) : googleReady ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => signIn('calendar')}
              className="h-11 rounded-[14px] text-sm font-semibold disabled:opacity-50"
              style={accent}
            >
              {busy ? 'Открываем Google…' : 'Войти через Google'}
            </button>
            <span className="text-2xs leading-[1.45] text-slate-500">
              Google спросит разрешение на просмотр мероприятий: приложение только читает встречи основного
              календаря и ничего в нём не меняет.
            </span>
          </div>
        ) : google ? (
          <span className="text-2xs leading-[1.5] text-slate-400">
            Вход через Google ещё не настроен на сервере — пока подключите календарь iCal-ссылкой ниже.
          </span>
        ) : (
          <span className="text-2xs text-slate-500">Проверяем вход в Google…</span>
        )}

        {sources.length > 0 && (
          <Toggle
            on={settings?.meeting_reminders !== false}
            onChange={(v) => setReminders.mutate(v, { onError })}
            title="Пуш в начале встречи"
            hint="если учёт не идёт — с вопросом, начать ли его. В Telegram — отдельной галочкой"
          />
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={card}>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-100">Другой календарь</span>
          <span className="text-2xs leading-[1.5] text-slate-500">
            Outlook, Яндекс, iCloud или второй календарь Google — по секретной ссылке в формате iCal, без входа.
          </span>
        </div>

        {others.map((src) => (
          <SourceRow key={src.id} src={src} title={src.name || 'Календарь'} />
        ))}

        {showForm ? (
          <div className="flex flex-col gap-2.5">
            <ol className="flex list-decimal flex-col gap-1 pl-4 text-2xs leading-[1.5] text-slate-400">
              <li>В настройках календаря найдите ссылку для подписки в формате iCal (.ics).</li>
              <li>Google: на компьютере ⚙ «Настройки» → слева календарь → «Интеграция календаря» → «Секретный адрес в формате iCal».</li>
              <li>Скопируйте ссылку и вставьте сюда.</li>
            </ol>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/basic.ics"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              className="h-11 min-w-0 rounded-xl px-3 font-mono text-xs text-slate-100 placeholder:text-[var(--s-placeholder)]"
              style={{ background: 'var(--s-input)', border: '1px solid var(--s-border-strong)' }}
            />
            <span className="text-2xs leading-[1.45] text-slate-500">
              Ссылка секретная: по ней видны ваши встречи. Она хранится только на сервере Semternity.
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!url.trim() || actions.add.isPending}
                onClick={connect}
                className="h-11 flex-1 rounded-[14px] text-sm font-semibold disabled:opacity-50"
                style={accent}
              >
                {actions.add.isPending ? 'Проверяем календарь…' : 'Подключить'}
              </button>
              {(adding || others.length > 0) && (
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="h-11 rounded-[14px] px-4 text-sm text-slate-400"
                  style={outline}
                >
                  Отмена
                </button>
              )}
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="self-start text-xs text-brass-600">
            + Подключить по iCal-ссылке
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={card}>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-100">Учёт в вашем календаре</span>
          <span className="text-2xs leading-[1.5] text-slate-500">
            Сессии учёта и сроки задач — отдельным календарём рядом со встречами: видно, куда ушёл день.
          </span>
        </div>
        {feedUrl ? (
          <>
            <input
              readOnly
              value={feedUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 min-w-0 rounded-xl px-3 font-mono text-2xs text-slate-300"
              style={{ background: 'var(--s-input)', border: '1px solid var(--s-border-strong)' }}
            />
            <button
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(feedUrl)
                  .then(() => showSuccess('Ссылка скопирована'))
                  .catch(() => showError('Не удалось скопировать — выделите ссылку и скопируйте вручную'))
              }
              className="h-11 rounded-[14px] text-sm font-medium text-slate-300"
              style={outline}
            >
              Скопировать ссылку
            </button>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-2xs leading-[1.5] text-slate-400">
              <li>Google Календарь на компьютере: «Другие календари» → «+» → «Добавить по URL». Google обновляет такие календари раз в несколько часов.</li>
              <li>iPhone: Настройки → Календарь → Учётные записи → Новая → Другое → «Подписной календарь». Обновляется чаще.</li>
            </ul>
          </>
        ) : (
          <button
            type="button"
            disabled={actions.feed.isPending}
            onClick={() => actions.feed.mutate(false, { onError, onSuccess: (r) => setFeedUrl(r.url) })}
            className="h-11 rounded-[14px] text-sm font-medium text-slate-300 disabled:opacity-50"
            style={outline}
          >
            {actions.feed.isPending ? 'Готовим ссылку…' : 'Получить ссылку для подписки'}
          </button>
        )}
      </div>
    </>
  )
}

/* ── Google Диск ───────────────────────────────────────────────── */

/**
 * Google Диск: файлы из Диска в задачах и карточках (ссылкой, без копий), папка у проекта,
 * отчёты — на Диск одной кнопкой. Доступ только к тому, что выбрано в окне Google.
 * Вход в Google общий с календарём: отключение здесь отключает и Google Календарь.
 */
export function DriveCard() {
  const { data: status, isLoading, error } = useGoogleStatus()
  const { data: settings } = useUserSettings()
  const actions = useGoogleActions()
  const saveFolder = useSaveDriveReportsFolder()
  const { signIn, busy } = useGoogleSignIn()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))
  const linked = status?.linked

  return (
    <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={card}>
      <span className="text-2xs leading-[1.5] text-slate-500">
        Файлы из Google Диска прикрепляются к задачам и проектам ссылкой — без копий и без ограничения
        в 50 МБ. У проекта может быть своя папка, а отчёт за период ложится на Диск одной кнопкой.
        Приложение видит только то, что вы сами выбрали в окне Google.
      </span>
      {isLoading && <span className="text-2xs text-slate-500">Проверяем…</span>}
      {error && <span className="text-2xs text-terra-400">Не удалось узнать статус: {describeError(error)}</span>}
      {status && !status.configured && (
        <span className="text-2xs leading-[1.5] text-slate-400">
          Google Диск ещё не настроен на сервере — как только он будет готов, здесь появится кнопка «Подключить».
        </span>
      )}

      {status?.configured && !linked?.drive && (
        <>
          {linked && (
            <span className="text-2xs leading-[1.5] text-slate-400">
              Вход в Google уже есть{linked.email ? ` (${linked.email})` : ''} — Google спросит только доступ к Диску.
            </span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => signIn('drive')}
            className="h-11 rounded-[14px] text-sm font-semibold disabled:opacity-50"
            style={accent}
          >
            {busy ? 'Открываем Google…' : 'Подключить Google Диск'}
          </button>
        </>
      )}

      {linked?.drive && (
        <>
          <span className="text-2xs leading-[1.5] text-sage-400">
            Подключено{linked.email ? `: ${linked.email}` : ''}
          </span>
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
            style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-hairline)' }}
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-xs text-slate-500">Папка для отчётов</span>
              <span className="truncate text-sm text-slate-100">{settings?.drive_reports_folder_name || 'Не выбрана'}</span>
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  const [folder] = await pickFromDrive(status!, { folders: true })
                  if (folder) {
                    saveFolder.mutate(
                      { id: folder.id, name: folder.name },
                      { onError, onSuccess: () => showSuccess(`Отчёты будут ложиться в «${folder.name}»`) },
                    )
                  }
                } catch (e) {
                  onError(e)
                }
              }}
              className="h-9 shrink-0 rounded-[11px] px-3 text-xs font-medium text-slate-300"
              style={outline}
            >
              Выбрать
            </button>
          </div>
        </>
      )}

      {linked && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={actions.unlink.isPending}
            onClick={() => actions.unlink.mutate(undefined, { onError, onSuccess: () => showSuccess('Google отключён') })}
            className="h-11 rounded-[14px] text-sm font-medium text-slate-400 disabled:opacity-50"
            style={outline}
          >
            Выйти из Google
          </button>
          {linked.calendar && (
            <span className="text-2xs leading-[1.45] text-slate-500">
              Вход общий с календарём: встречи из Google Календаря тоже перестанут приходить.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
