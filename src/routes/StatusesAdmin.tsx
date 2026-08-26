import { PicklistAdmin } from '../components/PicklistAdmin'
import { describeError, useToast } from '../lib/Toast'
import {
  useCreateStatus,
  useDeleteStatus,
  useReorderStatuses,
  useSetStatusFinal,
  useStatuses,
  useUpdateStatus,
} from '../lib/queries/statuses'

export function StatusesAdmin() {
  const { data: statuses = [], isLoading } = useStatuses()
  const createStatus = useCreateStatus()
  const updateStatus = useUpdateStatus()
  const deleteStatus = useDeleteStatus()
  const reorderStatuses = useReorderStatuses()
  const setStatusFinal = useSetStatusFinal()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  return (
    <>
      <PicklistAdmin
        title="Статусы"
        placeholder="Например: 25%, В работе, Готово"
        items={statuses}
        loading={isLoading}
        labelOf={(s) => s.label}
        onCreate={(name) => createStatus.mutate(name, { onError })}
        onUpdate={(id, name) => updateStatus.mutate({ id, name }, { onError })}
        onDelete={(id) => deleteStatus.mutate(id, { onError })}
        onReorder={(items) => reorderStatuses.mutate(items, { onError })}
        finalOf={(s) => s.is_final}
        onToggleFinal={(s, value) => setStatusFinal.mutate({ id: s.id, isFinal: value }, { onError })}
      />
      <p className="mx-auto max-w-lg px-4 text-xs text-slate-500">
        «Финальный» статус считается завершением задачи — влияет на фильтр «скрыть завершённые» и на
        статистику по закрытым задачам.
      </p>
    </>
  )
}
