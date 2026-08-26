import { PicklistAdmin } from '../components/PicklistAdmin'
import {
  useCreateSection,
  useDeleteSection,
  useReorderSections,
  useSections,
  useUpdateSection,
} from '../lib/queries/sections'

export function SectionsAdmin() {
  const { data: sections = [] } = useSections()
  const createSection = useCreateSection()
  const updateSection = useUpdateSection()
  const deleteSection = useDeleteSection()
  const reorderSections = useReorderSections()

  return (
    <PicklistAdmin
      title="Разделы"
      placeholder="Название раздела"
      items={sections}
      labelOf={(s) => s.name}
      onCreate={(name) => createSection.mutate(name)}
      onUpdate={(id, name) => updateSection.mutate({ id, name })}
      onDelete={(id) => deleteSection.mutate(id)}
      onReorder={(items) => reorderSections.mutate(items)}
    />
  )
}
