import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { UserError } from './Toast'

/**
 * Пуш-уведомления. Публичная половина ключа VAPID — не секрет, она и нужна браузеру,
 * чтобы подписаться. Закрытая лежит на сервере, в app_secrets.
 */
const VAPID_PUBLIC_KEY =
  'BDTyk_3ny6Til1HuggDAAmjgJ-wuQwBUFueb_mqmARy2QXxZVuvBE4YEiY1bTFaSBb6r_SrXZ1TAv_JZ1ccpKQY'

export type PushState =
  | 'unsupported' // браузер не умеет пуши вовсе
  | 'needs-install' // iPhone: пуши есть только у приложения, добавленного на экран «Домой»
  | 'denied' // запрещены в настройках
  | 'off'
  | 'on'

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

async function readState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

/** Включить: спросить разрешение (только из нажатия!), подписаться, запомнить на сервере. */
async function enable(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new UserError('Разрешение на уведомления не дано')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

async function disable(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Пробное уведомление — приходит с сервера тем же путём, что и настоящие напоминания. */
async function sendTest(): Promise<{ sent: number; devices: number }> {
  const { data, error } = await supabase.functions.invoke('timer-reminders', { body: { action: 'test' } })
  if (error) throw error
  return data as { sent: number; devices: number }
}

export function usePush() {
  const [state, setState] = useState<PushState | null>(null)
  const refresh = useCallback(() => {
    readState()
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    state,
    enable: async () => {
      await enable()
      refresh()
    },
    disable: async () => {
      await disable()
      refresh()
    },
    sendTest,
  }
}

/* ── плашка «Идёт учёт» ───────────────────────────────────────────── */

const LIVE_KEY = 'semternity.liveNotification'
const LIVE_SHOWN_KEY = 'semternity.liveShownFor'
const LIVE_TAG = 'semternity-live'

export function liveNotificationEnabled(): boolean {
  try {
    return localStorage.getItem(LIVE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setLiveNotificationEnabled(on: boolean) {
  try {
    localStorage.setItem(LIVE_KEY, on ? 'on' : 'off')
  } catch {
    // не запомнили — останется включённой
  }
  if (!on) void closeLiveNotification()
}

async function closeLiveNotification() {
  if (!supported()) return
  const reg = await navigator.serviceWorker.ready
  const list = await reg.getNotifications({ tag: LIVE_TAG })
  list.forEach((n) => n.close())
}

/**
 * Уведомление «Идёт учёт» висит в центре уведомлений и на экране блокировки, пока таймер
 * идёт, и убирается, когда его останавливают. Показывается один раз на сессию таймера:
 * смахнули — по каждому открытию приложения оно не вернётся.
 */
export function useLiveTimerNotification(timer: { started_at: string; task_id: string } | null | undefined, taskName: string | undefined) {
  useEffect(() => {
    if (!supported() || Notification.permission !== 'granted') return
    if (!timer) {
      void closeLiveNotification()
      try {
        localStorage.removeItem(LIVE_SHOWN_KEY)
      } catch {
        // нечего чистить
      }
      return
    }
    if (!taskName || !liveNotificationEnabled()) return
    let shownFor: string | null = null
    try {
      shownFor = localStorage.getItem(LIVE_SHOWN_KEY)
    } catch {
      shownFor = null
    }
    if (shownFor === timer.started_at) return
    const since = new Date(timer.started_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification(`Идёт учёт · ${taskName}`, {
          body: `С ${since}. Нажмите, чтобы открыть задачу и остановить`,
          tag: LIVE_TAG,
          silent: true,
          data: { url: `/tasks/${timer.task_id}` },
          icon: '/icon-192.png',
          badge: '/favicon-48.png',
        }),
      )
      .then(() => {
        try {
          localStorage.setItem(LIVE_SHOWN_KEY, timer.started_at)
        } catch {
          // не запомнили — покажем ещё раз при следующем открытии
        }
      })
      .catch(() => {
        // нет разрешения или воркера — плашки просто не будет
      })
  }, [timer?.started_at, timer?.task_id, taskName, timer])
}
