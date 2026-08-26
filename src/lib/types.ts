export interface Section {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Status {
  id: string
  user_id: string
  label: string
  sort_order: number
  is_final: boolean
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  name: string
  project_id: string
  section_id: string
  status_id: string | null
  planned_hours: number
  fact_hours: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  task_id: string
  entry_type: 'timer' | 'manual_adjustment'
  started_at: string | null
  ended_at: string | null
  duration_minutes: number
  note: string | null
  created_at: string
}

export interface ActiveTimer {
  user_id: string
  task_id: string
  started_at: string
}

export interface Comment {
  id: string
  user_id: string
  task_id: string
  body: string
  created_at: string
}
