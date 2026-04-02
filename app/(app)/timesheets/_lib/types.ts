import { isAfter, endOfWeek } from 'date-fns'

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export type ProjectSummary = { id: string; name: string; hours: number; managerId?: string | null }

export type ReviewEvent = { status: 'approved' | 'rejected'; note: string | null; reviewed_at: string }

export type Timesheet = {
  id: string
  user_id: string
  workspace_id: string
  week_start: string
  status: TimesheetStatus
  note: string | null
  reviewer_note: string | null
  submitted_at: string | null
  reviewed_at: string | null
  review_history?: ReviewEvent[]
  project_approvals?: Record<string, { status: 'approved' | 'rejected'; by: string; at: string }>
  total_seconds?: number
  projectSummary?: ProjectSummary[]
  locked?: boolean
  locked_at?: string | null
}

export type TimeOffEntry = {
  id: string
  user_id: string
  workspace_id: string
  date: string
  type: 'vacation' | 'holiday' | 'sick'
  hours: number
  notes: string | null
}

export const TIME_OFF_LABELS: Record<string, string> = {
  vacation: 'Vacation',
  holiday:  'Public Holiday',
  sick:     'Sick Day',
}

/** Returns true if the Sunday 23:00 deadline for the given week has passed */
export function isDeadlinePassed(weekStart: Date): boolean {
  const deadline = new Date(endOfWeek(weekStart, { weekStartsOn: 1 }))
  deadline.setHours(23, 0, 0, 0)
  return isAfter(new Date(), deadline)
}
