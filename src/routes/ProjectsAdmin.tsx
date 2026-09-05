import { useNavigate } from 'react-router-dom'
import { PicklistAdmin } from '../components/PicklistAdmin'
import { describeError, useToast } from '../lib/Toast'
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useReorderProjects,
  useSetProjectArchived,
  useUpdateProject,
} from '../lib/queries/projects'

export function ProjectsAdmin() {
  const navigate = useNavigate()
  const { data: projects = [], isLoading } = useProjects()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const reorderProjects = useReorderProjects()
  const setArchived = useSetProjectArchived()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  return (
    <PicklistAdmin
      title="Проекты"
      placeholder="Название проекта"
      items={projects}
      loading={isLoading}
      labelOf={(p) => p.name}
      onCreate={(name) => createProject.mutate(name, { onError })}
      onUpdate={(id, name) => updateProject.mutate({ id, name }, { onError })}
      onDelete={(id) => deleteProject.mutate(id, { onError })}
      onReorder={(items) => reorderProjects.mutate(items, { onError })}
      archivedOf={(p) => p.archived}
      onToggleArchived={(p, archived) => setArchived.mutate({ id: p.id, archived }, { onError })}
      onOpen={(p) => navigate(`/projects/${p.id}`)}
    />
  )
}
