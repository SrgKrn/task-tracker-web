import { PicklistAdmin } from '../components/PicklistAdmin'
import { describeError, useToast } from '../lib/Toast'
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useReorderProjects,
  useUpdateProject,
} from '../lib/queries/projects'

export function ProjectsAdmin() {
  const { data: projects = [] } = useProjects()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const reorderProjects = useReorderProjects()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  return (
    <PicklistAdmin
      title="Проекты"
      placeholder="Название проекта"
      items={projects}
      labelOf={(p) => p.name}
      onCreate={(name) => createProject.mutate(name, { onError })}
      onUpdate={(id, name) => updateProject.mutate({ id, name }, { onError })}
      onDelete={(id) => deleteProject.mutate(id, { onError })}
      onReorder={(items) => reorderProjects.mutate(items, { onError })}
    />
  )
}
