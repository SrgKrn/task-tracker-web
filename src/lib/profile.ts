import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { supabase } from './supabaseClient'
import { useUserSettings } from './queries/userSettings'

const BUCKET = 'avatars'
/** сторона фото после сжатия: в приложении кружок не больше 76 px, запас на плотные экраны */
const AVATAR_SIDE = 512

export interface Profile {
  email: string
  /** имя или, пока его нет, часть почты до @ */
  name: string
  hasName: boolean
  initial: string
  avatarUrl: string | null
}

/** Ссылка на фото: бакет закрыт, поэтому ссылка подписанная, на сутки. */
function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar_url', path],
    enabled: !!path,
    staleTime: 12 * 3600_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 24 * 3600)
      if (error) return null
      return data.signedUrl
    },
  })
}

export function useProfile(): Profile {
  const { session } = useAuth()
  const { data: settings } = useUserSettings()
  const { data: avatarUrl } = useAvatarUrl(settings?.avatar_path)
  const email = session?.user.email ?? ''
  const name = settings?.display_name?.trim() || email.split('@')[0] || ''
  return {
    email,
    name,
    hasName: !!settings?.display_name?.trim(),
    initial: (name[0] ?? '?').toUpperCase(),
    avatarUrl: settings?.avatar_path ? (avatarUrl ?? null) : null,
  }
}

/** Квадрат по центру снимка, 512 px, webp — фото с телефона весит мегабайты. */
async function squareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIDE
  canvas.height = AVATAR_SIDE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не получилось обработать фото')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  if (!blob) throw new Error('Не получилось обработать фото')
  return blob
}

/**
 * Загрузить фото: новое имя файла каждый раз — подписанная ссылка на старое не покажет
 * прежнюю картинку из кэша. Старый файл удаляется после сохранения нового пути.
 */
export function useAvatarUpload() {
  const qc = useQueryClient()
  const { data: settings } = useUserSettings()

  async function setPath(path: string | null) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Нужно войти заново')
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, avatar_path: path })
    if (error) throw error
    const old = settings?.avatar_path
    if (old && old !== path) await supabase.storage.from(BUCKET).remove([old])
    await qc.invalidateQueries({ queryKey: ['user_settings'] })
  }

  return {
    upload: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Нужна картинка: JPG, PNG или HEIC')
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Нужно войти заново')
      const blob = await squareWebp(file)
      const path = `${user.id}/avatar-${Date.now()}.webp`
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp' })
      if (error) throw error
      await setPath(path)
    },
    remove: () => setPath(null),
  }
}
