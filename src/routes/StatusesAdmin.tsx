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
        title="Этапы"
        placeholder="Например: Не начато, В работе, Сдано"
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
      <p className="page mx-auto max-w-lg px-5 text-sm leading-[1.5] text-text-secondary">
        «Финальный» этап закрывает задачу: её прячет переключатель «Без готовых», и она считается в
        закрытых в «Сводке». Цвет этапа зависит от порядка: первый — серо-синий, промежуточные — синие,
        финальный — зелёный.
      </p>
    </>
  )
}
