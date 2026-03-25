export type ConsultantLevel = {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
}

export type ProjectLevelRate = {
  id: string
  project_id: string
  level_id: string
  hourly_rate: number
  rate_type: 'hourly' | 'daily'
  level?: ConsultantLevel
}

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

export type Client = {
  id: string
  user_id: string
  name: string
  email: string | null
  color: string
  notes: string | null
  created_at: string
}

export type Project = {
  id: string
  user_id: string
  client_id: string | null
  name: string
  color: string
  hourly_rate: number
  status: 'active' | 'archived'
  notes: string | null
  start_date: string | null
  end_date: string | null
  rounding_minutes: number
  budget_hours: number | null
  budget_amount: number | null
  created_at: string
  client?: Client
  level_rates?: ProjectLevelRate[]
}

export type TimeEntry = {
  id: string
  user_id: string
  project_id: string | null
  level_id: string | null
  description: string | null
  start_time: string
  end_time: string | null
  billable: boolean
  duration_sec: number | null
  created_at: string
  project?: Project & { client?: Client }
  level?: ConsultantLevel
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatMoney(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency }).format(amount)
}

export function calcEntryEarnings(
  durationSec: number,
  project: Project | null | undefined,
  levelId: string | null | undefined
): number {
  if (!durationSec || !project) return 0
  const hours = durationSec / 3600
  if (levelId && project.level_rates && project.level_rates.length > 0) {
    const lr = project.level_rates.find(r => r.level_id === levelId)
    if (lr) return hours * lr.hourly_rate
  }
  return hours * (project.hourly_rate || 0)
}
