import type { Section } from '../types'
import { createPicklistQueries } from './picklist'

const sections = createPicklistQueries<Section>('sections', 'name')

export const useSections = sections.useList
export const useCreateSection = sections.useCreate
export const useUpdateSection = sections.useUpdate
export const useDeleteSection = sections.useDelete
export const useReorderSections = sections.useReorder
