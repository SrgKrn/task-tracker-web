import type { Status } from '../types'
import { createPicklistQueries } from './picklist'

const statuses = createPicklistQueries<Status>('statuses', 'label')

export const useStatuses = statuses.useList
export const useCreateStatus = statuses.useCreate
export const useUpdateStatus = statuses.useUpdate
export const useDeleteStatus = statuses.useDelete
export const useReorderStatuses = statuses.useReorder
