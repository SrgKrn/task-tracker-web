import { PicklistAdmin } from '../components/PicklistAdmin'
import { describeError, useToast } from '../lib/Toast'
import {
  useCreateStatus,
  useDeleteStatus,
  useReorderStatuses,
  useStatuses,
  useUpdateStatus,
} from '../lib/queries/statuses'

export function StatusesAdmin() {
  const { data: statuses = [] } = useStatuses()
  const createStatus = useCreateStatus()
  const updateStatus = useUpdateStatus()
  const deleteStatus = useDeleteStatus()
  const reorderStatuses = useReorderStatuses()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  return (
    <PicklistAdmin
      title="Статусы"
      placeholder="Например: 25%, В работе, Готово"
      items={statuses}
      labelOf={(s) => s.label}
      onCreate={(name) => createStatus.mutate(name, { onError })}
      onUpdate={(id, name) => updateStatus.mutate({ id, name }, { onError })}
      onDelete={(id) => deleteStatus.mutate(id, { onError })}
      onReorder={(items) => reorderStatuses.mutate(items, { onError })}
    />
  )
}
