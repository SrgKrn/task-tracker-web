import { useNavigate } from 'react-router-dom'
import { PicklistAdmin } from '../components/PicklistAdmin'
import { describeError, useToast } from '../lib/Toast'
import {
  useCreateSection,
  useDeleteSection,
  useReorderSections,
  useSections,
  useUpdateSection,
} from '../lib/queries/sections'

export function SectionsAdmin() {
  const navigate = useNavigate()
  const { data: sections = [], isLoading } = useSections()
  const createSection = useCreateSection()
  const updateSection = useUpdateSection()
  const deleteSection = useDeleteSection()
  const reorderSections = useReorderSections()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  return (
    <PicklistAdmin
      title="Разделы"
      placeholder="Название раздела"
      items={sections}
      loading={isLoading}
      labelOf={(s) => s.name}
      onCreate={(name) => createSection.mutate(name, { onError })}
      onUpdate={(id, name) => updateSection.mutate({ id, name }, { onError })}
      onDelete={(id) => deleteSection.mutate(id, { onError })}
      onReorder={(items) => reorderSections.mutate(items, { onError })}
      onOpen={(s) => navigate(`/sections/${s.id}`)}
    />
  )
}
