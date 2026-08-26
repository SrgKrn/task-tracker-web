import type { Project } from '../types'
import { createPicklistQueries } from './picklist'

const projects = createPicklistQueries<Project>('projects', 'name')

export const useProjects = projects.useList
export const useCreateProject = projects.useCreate
export const useUpdateProject = projects.useUpdate
export const useDeleteProject = projects.useDelete
export const useReorderProjects = projects.useReorder
