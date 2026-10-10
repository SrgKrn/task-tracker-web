import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { UserError } from './Toast'

/**
 * Google: Диск и Календарь через один вход. Вход и ключ обновления — на сервере (функция
 * google), приложение получает ключ доступа на час, когда нужно открыть окно выбора файлов
 * или выгрузить отчёт. Доступ узкий: на Диске — только файлы, которые выбрали в окне Google,
 * и те, что создало приложение; в календаре — только чтение встреч.
 */
export interface GoogleStatus {
  /** клиент Google заведён на сервере */
  configured: boolean
  apiKey: string
  appId: string
  /** drive и calendar — какие разрешения выданы при входе */
  linked: { email: string; drive: boolean; calendar: boolean } | null
}

export type GoogleService = 'drive' | 'calendar'

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('google', { body: { action, ...extra } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw body?.error ? new UserError(body.error) : error
  }
  return data as T
}

export function useGoogleStatus() {
  return useQuery({
    queryKey: ['google_status'],
    queryFn: () => call<GoogleStatus>('status'),
    // вернулись из окна входа Google — статус перечитается сам
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  })
}

/** Возврат из Google: страница /oauth/google отдаёт код серверу. */
export function exchangeGoogleCode(code: string, state: string) {
  return call<{ ok: boolean; email: string; service: GoogleService; events?: number }>('exchange', { code, state })
}

/** Что подключали — по одноразовому state: «c.…» — календарь, иначе Диск. Так же решает сервер. */
export function googleServiceOf(state: string): GoogleService {
  return state.startsWith('c.') ? 'calendar' : 'drive'
}

export function useGoogleActions() {
  const qc = useQueryClient()
  return {
    /**
     * Уйти на вход в Google. Спрашивается только разрешение для service — выданные раньше
     * сохраняются. Переадресация, а не окно: на iPhone окно входа не возвращается в приложение.
     */
    signIn: async (service: GoogleService) => {
      const { url } = await call<{ url: string }>('auth_url', { service })
      window.location.href = url
    },
    unlink: useMutation({
      mutationFn: () => call('unlink'),
      onSuccess: () => {
        qc.setQueryData<GoogleStatus>(['google_status'], (s) => (s ? { ...s, linked: null } : s))
        // вместе с входом в Google отключается и Google Календарь
        qc.invalidateQueries({ queryKey: ['calendar_sources'] })
        qc.invalidateQueries({ queryKey: ['calendar_events'] })
        cachedToken = null
      },
    }),
  }
}

/* ── ключ доступа ──────────────────────────────────────────────── */

let cachedToken: { value: string; until: number } | null = null

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now() + 60_000) return cachedToken.value
  const r = await call<{ access_token: string; expires_in: number }>('token')
  cachedToken = { value: r.access_token, until: Date.now() + r.expires_in * 1000 }
  return r.access_token
}

/* ── окно выбора Google ────────────────────────────────────────── */

declare global {
  interface Window {
    gapi?: { load: (name: string, cb: () => void) => void }
    google?: { picker: any } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

let pickerReady: Promise<void> | null = null

function loadPicker(): Promise<void> {
  if (pickerReady) return pickerReady
  pickerReady = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.onload = () => window.gapi!.load('picker', () => resolve())
    script.onerror = () => {
      pickerReady = null
      reject(new UserError('Не удалось открыть Google Диск — проверьте интернет'))
    }
    document.head.appendChild(script)
  })
  return pickerReady
}

export interface DriveFile {
  id: string
  name: string
  url: string
  mimeType: string
  sizeBytes?: number
}

/**
 * Окно выбора Google Диска. Файлы — несколько сразу; папка — одна. Пусто — выбор отменили.
 * startIn — папка, с которой окно открывается (папка проекта).
 */
export async function pickFromDrive(
  status: GoogleStatus,
  options: { folders?: boolean; startIn?: string | null } = {},
): Promise<DriveFile[]> {
  if (!status.apiKey || !status.appId) throw new UserError('Окно выбора Google Диска ещё не настроено')
  const [token] = await Promise.all([accessToken(), loadPicker()])
  const picker = window.google!.picker
  return new Promise((resolve) => {
    const view = options.folders
      ? new picker.DocsView(picker.ViewId.FOLDERS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true)
          .setMimeTypes('application/vnd.google-apps.folder')
      : new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true)
    if (options.startIn) view.setParent(options.startIn)
    const builder = new picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(status.apiKey)
      .setAppId(status.appId)
      .setLocale('ru')
      .addView(view)
      .setTitle(options.folders ? 'Выберите папку' : 'Выберите файлы')
      .setCallback((data: { action: string; docs?: { id: string; name: string; url: string; mimeType: string; sizeBytes?: number }[] }) => {
        if (data.action === picker.Action.PICKED) {
          resolve(
            (data.docs ?? []).map((d) => ({
              id: d.id,
              name: d.name,
              url: d.url,
              mimeType: d.mimeType,
              sizeBytes: d.sizeBytes ? Number(d.sizeBytes) : undefined,
            })),
          )
        } else if (data.action === picker.Action.CANCEL) {
          resolve([])
        }
      })
    if (!options.folders) builder.enableFeature(picker.Feature.MULTISELECT_ENABLED)
    builder.build().setVisible(true)
  })
}

/** Положить файл на Диск в папку; вернуть ссылку на него. */
export async function uploadToDrive(blob: Blob, name: string, folderId: string | null): Promise<string> {
  const token = await accessToken()
  const meta = { name, mimeType: blob.type || 'application/octet-stream', ...(folderId ? { parents: [folderId] } : {}) }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  form.append('file', blob)
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (r.status === 404) throw new UserError('Папка на Диске недоступна — выберите её заново')
  if (!r.ok) throw new UserError('Google Диск не принял файл — попробуйте ещё раз')
  const j = await r.json()
  return j.webViewLink as string
}
