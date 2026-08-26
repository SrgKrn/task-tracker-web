import { PicklistAdmin } from '../components/PicklistAdmin'
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

  return (
    <PicklistAdmin
      title="Проекты"
      placeholder="Название проекта"
      items={projects}
      labelOf={(p) => p.name}
      onCreate={(name) => createProject.mutate(name)}
      onUpdate={(id, name) => updateProject.mutate({ id, name })}
      onDelete={(id) => deleteProject.mutate(id)}
      onReorder={(items) => reorderProjects.mutate(items)}
    />
  )
}
