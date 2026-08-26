import { PicklistAdmin } from '../components/PicklistAdmin'
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

  return (
    <PicklistAdmin
      title="Статусы"
      placeholder="Например: 25%, В работе, Готово"
      items={statuses}
      labelOf={(s) => s.label}
      onCreate={(name) => createStatus.mutate(name)}
      onUpdate={(id, name) => updateStatus.mutate({ id, name })}
      onDelete={(id) => deleteStatus.mutate(id)}
      onReorder={(items) => reorderStatuses.mutate(items)}
    />
  )
}
