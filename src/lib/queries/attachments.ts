import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { Attachment } from '../types'

const BUCKET = 'attachments'
/** ссылка на файл живёт час — список перечитывает их раньше, чем они протухнут */
const LINK_TTL_SECONDS = 60 * 60

export type AttachmentWithUrl = Attachment & { url: string | null }

/**
 * Файлы проекта (все: его собственные и всех его задач) или набора задач.
 * Вместе с каждым файлом — готовая ссылка на открытие: на iPhone окно, открытое
 * после ожидания ответа сервера, браузер блокирует, поэтому ссылку берём заранее.
 */
export function useAttachments(scope: { projectId?: string; taskIds?: string[] }) {
  const key = scope.projectId
    ? ['attachments', 'project', scope.projectId]
    : ['attachments', 'tasks', ...(scope.taskIds ?? [])]
  return useQuery({
    queryKey: key,
    enabled: !!scope.projectId || (scope.taskIds?.length ?? 0) > 0,
    staleTime: (LINK_TTL_SECONDS - 10 * 60) * 1000,
    queryFn: async (): Promise<AttachmentWithUrl[]> => {
      let q = supabase.from('attachments').select('*').order('created_at', { ascending: false })
      q = scope.projectId ? q.eq('project_id', scope.projectId) : q.in('task_id', scope.taskIds ?? [])
      const { data, error } = await q
      if (error) throw error
      const files = (data ?? []) as Attachment[]
      if (files.length === 0) return []
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          files.map((f) => f.path),
          LINK_TTL_SECONDS,
        )
      if (signError) throw signError
      const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
      return files.map((f) => ({ ...f, url: urlByPath.get(f.path) ?? null }))
    },
  })
}

function extensionOf(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,8})$/i)
  return m ? `.${m[1].toLowerCase()}` : ''
}

/**
 * Загрузка. В хранилище файл лежит под случайным именем: кириллицу и пробелы в путях
 * оно не принимает. Настоящее имя — в таблице, с ним файл и показывается.
 */
export function useUploadAttachments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      files,
      projectId,
      taskId,
      onProgress,
    }: {
      files: File[]
      projectId: string
      taskId?: string | null
      onProgress?: (done: number, total: number) => void
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Нужно войти заново')
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = `${user.id}/${projectId}/${crypto.randomUUID()}${extensionOf(file.name)}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
        if (uploadError) throw uploadError
        const { error } = await supabase.from('attachments').insert({
          project_id: projectId,
          task_id: taskId ?? null,
          name: file.name,
          path,
          size: file.size,
          mime: file.type,
        })
        if (error) {
          // запись не легла — не оставляем в хранилище файл, на который ничто не ссылается
          await supabase.storage.from(BUCKET).remove([path])
          throw error
        }
        onProgress?.(i + 1, files.length)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments'] }),
  })
}

export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: Attachment) => {
      const { error } = await supabase.from('attachments').delete().eq('id', file.id)
      if (error) throw error
      await supabase.storage.from(BUCKET).remove([file.path])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments'] }),
  })
}

/**
 * Перед удалением задачи — её файлы из хранилища. Строки в таблице уйдут каскадом,
 * а сами файлы база удалить не может: без этого они остались бы лежать никому не нужными.
 */
export async function removeTaskFiles(taskIds: string[]) {
  if (taskIds.length === 0) return
  const { data, error } = await supabase.from('attachments').select('path').in('task_id', taskIds)
  if (error) throw error
  const paths = (data ?? []).map((r: { path: string }) => r.path)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}
