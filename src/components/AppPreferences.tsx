import { useState } from 'react'
import { Bell, Send } from './Icon'
import { Segmented } from './ui'
import { describeError, UserError, useToast } from '../lib/Toast'
import { liveNotificationEnabled, setLiveNotificationEnabled, usePush } from '../lib/push'
import { useTelegramActions, useTelegramLink, useTelegramStatus } from '../lib/telegram'
import { setTheme, useTheme, type ThemeChoice } from '../lib/theme'

const card = { background: 'var(--s-surface)', border: '1px solid var(--s-border)' }

/** Оформление: тёмная, светлая или как в системе. Настройка этого устройства. */
export function ThemeCard() {
  const theme = useTheme()
  return (
    <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={card}>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-100">Оформление</span>
        <span className="text-2xs leading-[1.5] text-slate-500">
          Светлая тема — в палитре PDF-отчёта. На iPhone цвет строки с часами и батареей
          обновится при следующем запуске приложения.
        </span>
      </div>
      <Segmented<ThemeChoice>
        value={theme}
        onChange={setTheme}
        className="self-start"
        options={[
          { value: 'dark', label: 'Тёмная' },
          { value: 'light', label: 'Светлая' },
          { value: 'system', label: 'Как в системе' },
        ]}
      />
    </div>
  )
}

const STATE_TEXT: Record<string, string> = {
  on: 'Включены на этом устройстве',
  off: 'Выключены',
  denied: 'Запрещены. На iPhone: Настройки → Уведомления → Semternity; в браузере — значок замка у адреса',
  'needs-install':
    'На iPhone уведомления приходят только приложению на экране «Домой»: «Поделиться» → «На экран „Домой“», затем откройте его оттуда',
  unsupported: 'Этот браузер не умеет пуш-уведомления',
}

/** Пуш-уведомления: напоминание о долгом учёте и плашка «Идёт учёт». */
export function NotificationsCard() {
  const push = usePush()
  const { showError, showSuccess } = useToast()
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(liveNotificationEnabled)

  async function run(action: () => Promise<void>, ok?: string) {
    setBusy(true)
    try {
      await action()
      if (ok) showSuccess(ok)
    } catch (e) {
      showError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const state = push.state
  return (
    <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={card}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-sky-600">
          <Bell size={17} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-slate-100">Уведомления</span>
          <span className="text-2xs leading-[1.5] text-slate-500">
            Если учёт идёт больше часа — придёт вопрос «вы всё ещё работаете?», потом каждый
            следующий час. Работает и при заблокированном экране.
          </span>
          {state && (
            <span className={`text-2xs leading-[1.5] ${state === 'on' ? 'text-emerald-400' : 'text-slate-400'}`}>
              {STATE_TEXT[state]}
            </span>
          )}
        </div>
      </div>

      {(state === 'off' || state === 'on') && (
        <div className="flex gap-[9px]">
          {state === 'off' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(push.enable, 'Уведомления включены')}
              className="h-11 flex-1 rounded-[14px] text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
            >
              Включить
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await push.sendTest()
                    if (r.sent === 0) throw new UserError('Не удалось доставить — попробуйте выключить и включить снова')
                  }, 'Пробное отправлено — смотрите уведомления')
                }
                className="h-11 flex-1 rounded-[14px] text-sm font-medium text-slate-300 disabled:opacity-50"
                style={{ border: '1px solid var(--s-border-strong-2)' }}
              >
                Прислать пробное
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(push.disable, 'Уведомления выключены')}
                className="h-11 rounded-[14px] px-4 text-sm font-medium text-slate-400 disabled:opacity-50"
                style={{ border: '1px solid var(--s-border-strong-2)' }}
              >
                Выключить
              </button>
            </>
          )}
        </div>
      )}

      {state === 'on' && (
        <label className="-my-1 flex min-h-11 items-center gap-2.5 py-1">
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => {
              setLive(e.target.checked)
              setLiveNotificationEnabled(e.target.checked)
            }}
            className="h-[18px] w-[18px] shrink-0 accent-sky-600"
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm text-slate-300">Плашка «Идёт учёт»</span>
            <span className="text-2xs leading-[1.4] text-slate-500">
              при запуске таймера в уведомлениях и на экране блокировки появится задача и время
              начала; уберётся, когда остановите
            </span>
          </span>
        </label>
      )}
    </div>
  )
}

/** Telegram: бот пишет о долгом учёте — с кнопками «Остановить учёт» и «Ещё работаю». */
export function TelegramCard() {
  const { data: status, isLoading, error } = useTelegramStatus()
  const linked = status?.linked ?? null
  const { data: link } = useTelegramLink(!!status?.configured && !linked)
  const actions = useTelegramActions()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))

  return (
    <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={card}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-sky-600">
          <Send size={17} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-slate-100">Telegram</span>
          <span className="text-2xs leading-[1.5] text-slate-500">
            Бот пришлёт предупреждение, если учёт идёт дольше часа, — и даст остановить его прямо из
            чата. Работает вместе с пуш-уведомлениями или вместо них.
          </span>
          {isLoading && <span className="text-2xs text-slate-500">Проверяем…</span>}
          {error && <span className="text-2xs text-red-400">Не удалось узнать статус: {describeError(error)}</span>}
          {status && !status.configured && (
            <span className="text-2xs leading-[1.5] text-slate-400">
              Бот ещё не настроен — как только он появится, здесь будет кнопка «Подключить».
            </span>
          )}
          {linked && (
            <span className="text-2xs leading-[1.5] text-emerald-400">
              Подключено{linked.username ? `: @${linked.username}` : linked.firstName ? `: ${linked.firstName}` : ''}
            </span>
          )}
        </div>
      </div>

      {status?.configured && !linked && (
        <>
          {/* ссылка готова заранее: окно, открытое после ожидания сервера, iPhone блокирует */}
          <a
            href={link?.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!link}
            onClick={(e) => {
              if (!link) e.preventDefault()
            }}
            className="flex h-11 items-center justify-center rounded-[14px] text-sm font-semibold"
            style={{
              background: link ? 'var(--s-accent)' : 'var(--s-disabled-bg)',
              color: link ? 'var(--s-on-accent)' : 'var(--s-disabled-fg)',
            }}
          >
            {link ? 'Подключить Telegram' : 'Готовим ссылку…'}
          </a>
          <span className="text-2xs leading-[1.5] text-slate-500">
            Откроется чат с @{status.bot} — нажмите «Запустить» и вернитесь сюда.
          </span>
        </>
      )}

      {linked && (
        <>
          <label className="-my-1 flex min-h-11 items-center gap-2.5 py-1">
            <input
              type="checkbox"
              checked={linked.notifyLongTimer}
              onChange={(e) => actions.setLongTimer.mutate(e.target.checked, { onError })}
              className="h-[18px] w-[18px] shrink-0 accent-sky-600"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm text-slate-300">Предупреждать о долгом учёте</span>
              <span className="text-2xs leading-[1.4] text-slate-500">через час после запуска, потом каждый час</span>
            </span>
          </label>
          <div className="flex gap-[9px]">
            <button
              type="button"
              disabled={actions.test.isPending}
              onClick={() =>
                actions.test.mutate(undefined, { onError, onSuccess: () => showSuccess('Отправили — загляните в Telegram') })
              }
              className="h-11 flex-1 rounded-[14px] text-sm font-medium text-slate-300 disabled:opacity-50"
              style={{ border: '1px solid var(--s-border-strong-2)' }}
            >
              Прислать пробное
            </button>
            <button
              type="button"
              disabled={actions.unlink.isPending}
              onClick={() => actions.unlink.mutate(undefined, { onError, onSuccess: () => showSuccess('Telegram отключён') })}
              className="h-11 rounded-[14px] px-4 text-sm font-medium text-slate-400 disabled:opacity-50"
              style={{ border: '1px solid var(--s-border-strong-2)' }}
            >
              Отключить
            </button>
          </div>
        </>
      )}
    </div>
  )
}
