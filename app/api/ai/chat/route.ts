import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Mistral AI — free tier available at console.mistral.ai
// Uses OpenAI-compatible format with function calling support.
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions'
const MODEL = 'mistral-small-latest'

// ── Tool definitions (OpenAI-compatible format) ───────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_hours_summary',
      description: 'Get total hours worked. period: this_week|last_week|this_month|last_month|last_3_months. group_by: user|project|day|none.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'this_week, last_week, this_month, last_month, or last_3_months' },
          user_name: { type: 'string', description: 'Filter by member name (optional)' },
          project_name: { type: 'string', description: 'Filter by project name (optional)' },
          group_by: { type: 'string', description: 'Group by: user, project, day, or none' },
        },
        required: ['period', 'group_by'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_status',
      description: 'Get project budget, hours spent, and estimated revenue for one or all projects.',
      parameters: {
        type: 'object',
        properties: {
          project_name: { type: 'string', description: 'Filter by project name (optional, omit for all)' },
          include_inactive: { type: 'boolean', description: 'Include archived projects' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_revenue_summary',
      description: 'Get billable revenue (hours × rate) for a period. Use this for "what is my revenue this week/month" questions. Can group by project or user.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'this_week, last_week, this_month, last_month, or last_3_months' },
          group_by: { type: 'string', description: 'Group by: project, user, or none' },
          project_name: { type: 'string', description: 'Filter by project name (optional)' },
        },
        required: ['period', 'group_by'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice_status',
      description: 'Get invoice counts and amounts — overdue, sent/pending, paid. Use for "how many invoices are overdue" questions.',
      parameters: {
        type: 'object',
        properties: {
          include_paid: { type: 'boolean', description: 'Include paid invoices in the summary (default false)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_team_overview',
      description: 'Get team hours and utilization vs weekly targets. Can filter to one or two specific consultants by name for comparison. period: this_week|last_week|this_month.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'this_week, last_week, or this_month' },
          user_names: { type: 'string', description: 'Comma-separated member names to filter to (optional — omit for whole team)' },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget_burndown',
      description: 'Estimate when a project will exhaust its budget based on recent burn rate. Answers "when will project X run out of budget?"',
      parameters: {
        type: 'object',
        properties: {
          project_name: { type: 'string', description: 'Project name (partial match)' },
        },
        required: ['project_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_timesheet_status',
      description: 'Get timesheet submission and approval status for the team.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'current_week or last_week' },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_client_analysis',
      description: 'Analyse hours and revenue by client. Answers: which client is most profitable, total unbilled revenue, all hours for a specific client, which client has most hours without a budget.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'this_week, last_week, this_month, last_month, last_3_months, or all_time' },
          client_name: { type: 'string', description: 'Filter to a specific client (optional)' },
          metric: { type: 'string', description: 'profitability | unbilled | hours | no_budget — what to calculate' },
        },
        required: ['period', 'metric'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_billability_report',
      description: 'Billability and productivity stats. Answers: billability rate %, who worked overtime, who logged zero hours, effective hourly rate per consultant, revenue lost to non-billable hours.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'this_week, last_week, this_month, or last_month' },
          metric: { type: 'string', description: 'billability | overtime | zero_hours | effective_rate | non_billable_cost' },
          user_name: { type: 'string', description: 'Filter to a specific consultant (optional)' },
        },
        required: ['period', 'metric'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_activity',
      description: 'Project health and activity checks. Answers: which projects have had no activity recently, which projects are near their deadline, total budget remaining across all active projects.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', description: 'idle | near_deadline | budget_remaining' },
          idle_days: { type: 'number', description: 'Days of inactivity threshold for idle check (default 14)' },
          deadline_days: { type: 'number', description: 'Days ahead to look for upcoming deadlines (default 30)' },
        },
        required: ['metric'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_timesheet_analytics',
      description: 'Deeper timesheet analysis. Answers: who has never submitted a timesheet, locked vs submitted vs approved counts, which consultants submit late most often.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', description: 'never_submitted | status_breakdown | late_submissions' },
          weeks_back: { type: 'number', description: 'How many past weeks to analyse (default 8)' },
        },
        required: ['metric'],
      },
    },
  },
]

// ── Date helpers ──────────────────────────────────────────────────────────────

function getPeriodBounds(period: string): { start: Date; end: Date } {
  const now = new Date()
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
  const thisWeekStart = new Date(todayMs - dow * 86400000)
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000)
  switch (period) {
    case 'this_week':     return { start: thisWeekStart, end: new Date(now) }
    case 'last_week':     return { start: lastWeekStart, end: new Date(thisWeekStart.getTime() - 1000) }
    case 'this_month':    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now) }
    case 'last_month':    return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) }
    case 'last_3_months': return { start: new Date(now.getFullYear(), now.getMonth() - 3, 1), end: new Date(now) }
    default:              return { start: thisWeekStart, end: new Date(now) }
  }
}

// ── Tool executors ────────────────────────────────────────────────────────────

async function runGetHoursSummary(db: any, workspaceId: string, userId: string, role: string, input: any) {
  const { start, end } = getPeriodBounds(input.period)
  let q = db.from('time_entries')
    .select('user_id, duration_sec, start_time, project:projects(name), profile:profiles(full_name)')
    .eq('workspace_id', workspaceId).not('end_time', 'is', null)
    .gte('start_time', start.toISOString()).lte('start_time', end.toISOString())
  if (role === 'member') q = q.eq('user_id', userId)
  const { data, error } = await q
  if (error) return { error: error.message }
  let entries: any[] = data || []
  if (!entries.length) return { result: 'No time entries found.' }
  if (input.project_name) entries = entries.filter((e: any) => e.project?.name?.toLowerCase().includes(input.project_name.toLowerCase()))
  if (input.user_name && role !== 'member') entries = entries.filter((e: any) => e.profile?.full_name?.toLowerCase().includes(input.user_name.toLowerCase()))
  if (!entries.length) return { result: 'No matching entries found.' }
  const total = entries.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0) / 3600
  if (input.group_by === 'user') {
    const byUser: Record<string, number> = {}
    for (const e of entries) { const n = e.profile?.full_name || 'Unknown'; byUser[n] = (byUser[n] || 0) + (e.duration_sec || 0) / 3600 }
    return { total_hours: Math.round(total * 10) / 10, by_user: Object.entries(byUser).sort((a, b) => b[1] - a[1]).map(([name, h]) => ({ name, hours: Math.round(h * 10) / 10 })) }
  }
  if (input.group_by === 'project') {
    const byP: Record<string, number> = {}
    for (const e of entries) { const n = e.project?.name || 'No project'; byP[n] = (byP[n] || 0) + (e.duration_sec || 0) / 3600 }
    return { total_hours: Math.round(total * 10) / 10, by_project: Object.entries(byP).sort((a, b) => b[1] - a[1]).map(([name, h]) => ({ name, hours: Math.round(h * 10) / 10 })) }
  }
  if (input.group_by === 'day') {
    const byD: Record<string, number> = {}
    for (const e of entries) { const d = e.start_time?.slice(0, 10) || '?'; byD[d] = (byD[d] || 0) + (e.duration_sec || 0) / 3600 }
    return { total_hours: Math.round(total * 10) / 10, by_day: Object.entries(byD).sort().map(([date, h]) => ({ date, hours: Math.round(h * 10) / 10 })) }
  }
  return { total_hours: Math.round(total * 10) / 10, entry_count: entries.length }
}

async function runGetProjectStatus(db: any, workspaceId: string, role: string, managedIds: string[], input: any) {
  if (role === 'member') return { error: 'No permission.' }
  let q = db.from('projects').select('id, name, budget_hours, hourly_rate, client:clients(name)').eq('workspace_id', workspaceId)
  if (!input.include_inactive) q = q.is('deleted_at', null)
  if (input.project_name) q = q.ilike('name', `%${input.project_name}%`)
  if (role === 'project_manager' && managedIds.length) q = q.in('id', managedIds)
  const { data: projects, error } = await q
  if (error) return { error: error.message }
  if (!projects?.length) return { result: 'No projects found.' }
  const ago = new Date(); ago.setMonth(ago.getMonth() - 6)
  const { data: entries } = await db.from('time_entries').select('project_id, duration_sec')
    .eq('workspace_id', workspaceId).not('end_time', 'is', null)
    .in('project_id', projects.map((p: any) => p.id)).gte('start_time', ago.toISOString())
  const hrs: Record<string, number> = {}
  for (const e of entries || []) hrs[e.project_id] = (hrs[e.project_id] || 0) + (e.duration_sec || 0) / 3600
  return { projects: projects.map((p: any) => {
    const spent = Math.round((hrs[p.id] || 0) * 10) / 10
    return { name: p.name, client: (p.client as any)?.name || null, hours_spent: spent, budget_hours: p.budget_hours || null, budget_used_pct: p.budget_hours ? Math.round(spent / p.budget_hours * 100) : null, estimated_revenue: p.hourly_rate ? Math.round(spent * p.hourly_rate) : null }
  }) }
}

async function runGetTeamOverview(db: any, workspaceId: string, role: string, input: any) {
  if (role === 'member') return { error: 'No permission.' }
  const { start, end } = getPeriodBounds(input.period)
  const { data: members } = await db.from('workspace_members').select('user_id, weekly_hours, profile:profiles(full_name)').eq('workspace_id', workspaceId).eq('status', 'active')
  const { data: entries } = await db.from('time_entries').select('user_id, duration_sec').eq('workspace_id', workspaceId).not('end_time', 'is', null).gte('start_time', start.toISOString()).lte('start_time', end.toISOString())
  const hrs: Record<string, number> = {}
  for (const e of entries || []) hrs[e.user_id] = (hrs[e.user_id] || 0) + (e.duration_sec || 0) / 3600
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  const wdays = Math.round(days * 5 / 7)

  // Optional name filter for consultant comparison
  const nameFilters = input.user_names
    ? input.user_names.split(',').map((n: string) => n.trim().toLowerCase()).filter(Boolean)
    : null

  let team = (members || []).map((m: any) => {
    const h = Math.round((hrs[m.user_id] || 0) * 10) / 10
    const target = m.weekly_hours ? Math.round(m.weekly_hours * wdays / 5 * 10) / 10 : null
    return { name: m.profile?.full_name || 'Unknown', hours_logged: h, target_hours: target, utilization_pct: target ? Math.round(h / target * 100) : null }
  }).sort((a: any, b: any) => b.hours_logged - a.hours_logged)

  if (nameFilters) {
    team = team.filter((m: any) => nameFilters.some((f: string) => m.name.toLowerCase().includes(f)))
  }

  return { period: input.period, team }
}

async function runGetTimesheetStatus(db: any, workspaceId: string, role: string, input: any) {
  if (role === 'member') return { error: 'No permission.' }
  const now = new Date()
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
  const thisWeek = new Date(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - dow * 86400000)
  const weekStart = input.period === 'last_week' ? new Date(thisWeek.getTime() - 7 * 86400000) : thisWeek
  const weekStr = weekStart.toISOString().slice(0, 10)
  const { data: ts } = await db.from('timesheets').select('user_id, status, profile:profiles(full_name)').eq('workspace_id', workspaceId).eq('week_start', weekStr)
  const { data: members } = await db.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', workspaceId).eq('status', 'active')
  const submitted = new Set((ts || []).map((t: any) => t.user_id))
  const notSubmitted = (members || []).filter((m: any) => !submitted.has(m.user_id)).map((m: any) => (m.profile as any)?.full_name || m.user_id)
  const groups: Record<string, string[]> = {}
  for (const t of ts || []) { const n = (t.profile as any)?.full_name || t.user_id; groups[t.status] = [...(groups[t.status] || []), n] }
  return { week: weekStr, not_submitted: notSubmitted, ...groups }
}

async function runGetRevenueSummary(db: any, workspaceId: string, role: string, managedIds: string[], input: any) {
  if (role === 'member') return { error: 'No permission.' }
  const { start, end } = getPeriodBounds(input.period)
  let q = db.from('time_entries')
    .select('user_id, duration_sec, hourly_rate, billable, project_id, project:projects(id, name, hourly_rate, client:clients(name)), profile:profiles(full_name)')
    .eq('workspace_id', workspaceId).not('end_time', 'is', null).eq('billable', true)
    .gte('start_time', start.toISOString()).lte('start_time', end.toISOString())
  if (role === 'project_manager' && managedIds.length) q = q.in('project_id', managedIds)
  if (input.project_name) q = q.ilike('project.name', `%${input.project_name}%`)
  const { data, error } = await q
  if (error) return { error: error.message }
  const entries: any[] = data || []
  if (!entries.length) return { result: 'No billable entries found for this period.' }

  const calcRate = (e: any) => e.hourly_rate || e.project?.hourly_rate || 0
  const totalRevenue = entries.reduce((s: number, e: any) => s + (e.duration_sec / 3600) * calcRate(e), 0)
  const totalHours = entries.reduce((s: number, e: any) => s + e.duration_sec / 3600, 0)

  if (input.group_by === 'project') {
    const byP: Record<string, { hours: number; revenue: number }> = {}
    for (const e of entries) {
      const n = e.project?.name || 'Unknown'
      if (!byP[n]) byP[n] = { hours: 0, revenue: 0 }
      byP[n].hours += e.duration_sec / 3600
      byP[n].revenue += (e.duration_sec / 3600) * calcRate(e)
    }
    return { period: input.period, total_hours: Math.round(totalHours * 10) / 10, total_revenue: Math.round(totalRevenue), by_project: Object.entries(byP).sort((a, b) => b[1].revenue - a[1].revenue).map(([name, v]) => ({ name, hours: Math.round(v.hours * 10) / 10, revenue: Math.round(v.revenue) })) }
  }
  if (input.group_by === 'user') {
    const byU: Record<string, { hours: number; revenue: number }> = {}
    for (const e of entries) {
      const n = e.profile?.full_name || 'Unknown'
      if (!byU[n]) byU[n] = { hours: 0, revenue: 0 }
      byU[n].hours += e.duration_sec / 3600
      byU[n].revenue += (e.duration_sec / 3600) * calcRate(e)
    }
    return { period: input.period, total_hours: Math.round(totalHours * 10) / 10, total_revenue: Math.round(totalRevenue), by_user: Object.entries(byU).sort((a, b) => b[1].revenue - a[1].revenue).map(([name, v]) => ({ name, hours: Math.round(v.hours * 10) / 10, revenue: Math.round(v.revenue) })) }
  }
  return { period: input.period, total_billable_hours: Math.round(totalHours * 10) / 10, total_revenue: Math.round(totalRevenue) }
}

async function runGetInvoiceStatus(db: any, workspaceId: string, role: string, input: any) {
  if (!['admin', 'partner'].includes(role)) return { error: 'No permission to view invoices.' }
  const now = new Date().toISOString()
  const { data: invoices, error } = await db.from('invoices')
    .select('id, status, subtotal, due_date, client_name, sent_at')
    .eq('workspace_id', workspaceId)
  if (error) return { error: error.message }
  if (!invoices?.length) return { result: 'No invoices found.' }

  const overdue = invoices.filter((i: any) => i.status !== 'paid' && i.due_date && i.due_date < now)
  const pending = invoices.filter((i: any) => i.status === 'sent' && (!i.due_date || i.due_date >= now))
  const draft   = invoices.filter((i: any) => i.status === 'draft')
  const paid    = invoices.filter((i: any) => i.status === 'paid')

  const sum = (arr: any[]) => arr.reduce((s: number, i: any) => s + (i.subtotal || 0), 0)

  return {
    overdue:  { count: overdue.length, total: Math.round(sum(overdue)), items: overdue.map((i: any) => ({ client: i.client_name, amount: Math.round(i.subtotal || 0), due: i.due_date?.slice(0, 10) })) },
    pending:  { count: pending.length, total: Math.round(sum(pending)) },
    draft:    { count: draft.length,   total: Math.round(sum(draft)) },
    ...(input.include_paid ? { paid: { count: paid.length, total: Math.round(sum(paid)) } } : {}),
  }
}

async function runGetBudgetBurndown(db: any, workspaceId: string, role: string, managedIds: string[], input: any) {
  if (role === 'member') return { error: 'No permission.' }
  let q = db.from('projects').select('id, name, budget_hours, budget_amount, hourly_rate, client:clients(name)').eq('workspace_id', workspaceId).is('deleted_at', null)
  if (input.project_name) q = q.ilike('name', `%${input.project_name}%`)
  if (role === 'project_manager' && managedIds.length) q = q.in('id', managedIds)
  const { data: projects } = await q
  if (!projects?.length) return { result: 'Project not found.' }

  const results = await Promise.all(projects.map(async (p: any) => {
    // Total hours spent ever
    const { data: allEntries } = await db.from('time_entries').select('duration_sec, start_time').eq('workspace_id', workspaceId).eq('project_id', p.id).not('end_time', 'is', null)
    const totalSpent = (allEntries || []).reduce((s: number, e: any) => s + (e.duration_sec || 0) / 3600, 0)

    // Burn rate: hours in last 4 weeks
    const fourWeeksAgo = new Date(); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
    const recent = (allEntries || []).filter((e: any) => new Date(e.start_time) >= fourWeeksAgo)
    const recentHours = recent.reduce((s: number, e: any) => s + (e.duration_sec || 0) / 3600, 0)
    const weeklyBurnRate = recentHours / 4

    const budgetH = p.budget_hours
    if (!budgetH) return { name: p.name, client: (p.client as any)?.name || null, hours_spent: Math.round(totalSpent * 10) / 10, note: 'No budget hours set' }

    const remaining = budgetH - totalSpent
    const pctUsed = Math.round(totalSpent / budgetH * 100)

    if (remaining <= 0) return { name: p.name, client: (p.client as any)?.name || null, hours_spent: Math.round(totalSpent * 10) / 10, budget_hours: budgetH, pct_used: pctUsed, status: 'Over budget' }
    if (weeklyBurnRate <= 0) return { name: p.name, hours_spent: Math.round(totalSpent * 10) / 10, budget_hours: budgetH, pct_used: pctUsed, status: 'No recent activity — cannot estimate burndown date' }

    const weeksLeft = remaining / weeklyBurnRate
    const burndownDate = new Date(); burndownDate.setDate(burndownDate.getDate() + Math.round(weeksLeft * 7))

    return {
      name: p.name,
      client: (p.client as any)?.name || null,
      hours_spent: Math.round(totalSpent * 10) / 10,
      budget_hours: budgetH,
      pct_used: pctUsed,
      hours_remaining: Math.round(remaining * 10) / 10,
      weekly_burn_rate: Math.round(weeklyBurnRate * 10) / 10,
      estimated_burndown_date: burndownDate.toISOString().slice(0, 10),
      weeks_remaining: Math.round(weeksLeft * 10) / 10,
    }
  }))
  return { projects: results }
}

async function runGetClientAnalysis(db: any, workspaceId: string, role: string, managedIds: string[], input: any) {
  if (role === 'member') return { error: 'No permission.' }
  const { start, end } = input.period === 'all_time'
    ? { start: new Date('2020-01-01'), end: new Date() }
    : getPeriodBounds(input.period)

  // Fetch entries with project+client info
  let q = db.from('time_entries')
    .select('user_id, duration_sec, billable, hourly_rate, project_id, project:projects(id, name, hourly_rate, budget_hours, client_id, client:clients(id, name))')
    .eq('workspace_id', workspaceId).not('end_time', 'is', null)
    .gte('start_time', start.toISOString()).lte('start_time', end.toISOString())
  if (role === 'project_manager' && managedIds.length) q = q.in('project_id', managedIds)
  const { data: entries, error } = await q
  if (error) return { error: error.message }
  let rows: any[] = entries || []
  if (input.client_name) rows = rows.filter((e: any) => e.project?.client?.name?.toLowerCase().includes(input.client_name.toLowerCase()))
  if (!rows.length) return { result: 'No data found.' }

  // Group by client
  const byClient: Record<string, { name: string; hours: number; billableHours: number; revenue: number; hasBudget: boolean }> = {}
  for (const e of rows) {
    const cName = e.project?.client?.name || 'No client'
    if (!byClient[cName]) byClient[cName] = { name: cName, hours: 0, billableHours: 0, revenue: 0, hasBudget: !!e.project?.budget_hours }
    const h = (e.duration_sec || 0) / 3600
    const rate = e.hourly_rate || e.project?.hourly_rate || 0
    byClient[cName].hours += h
    if (e.billable) { byClient[cName].billableHours += h; byClient[cName].revenue += h * rate }
    if (e.project?.budget_hours) byClient[cName].hasBudget = true
  }

  const clients = Object.values(byClient).map(c => ({
    client: c.name,
    total_hours: Math.round(c.hours * 10) / 10,
    billable_hours: Math.round(c.billableHours * 10) / 10,
    revenue: Math.round(c.revenue),
    hasBudget: c.hasBudget,
  }))

  if (input.metric === 'profitability') {
    return { period: input.period, clients: clients.sort((a, b) => b.revenue - a.revenue) }
  }
  if (input.metric === 'no_budget') {
    return { clients_without_budget: clients.filter(c => !c.hasBudget).sort((a, b) => b.total_hours - a.total_hours) }
  }
  if (input.metric === 'unbilled') {
    // Unbilled = billable hours not yet invoiced — approximate as billable revenue with no paid invoice
    const { data: invoices } = await db.from('invoices').select('client_name, subtotal, status').eq('workspace_id', workspaceId).eq('status', 'paid')
    const paidByClient: Record<string, number> = {}
    for (const inv of invoices || []) paidByClient[inv.client_name] = (paidByClient[inv.client_name] || 0) + (inv.subtotal || 0)
    return {
      period: input.period,
      unbilled: clients.map(c => ({
        client: c.client,
        billable_revenue: c.revenue,
        paid_invoices: Math.round(paidByClient[c.client] || 0),
        estimated_unbilled: Math.round(Math.max(0, c.revenue - (paidByClient[c.client] || 0))),
      })).sort((a, b) => b.estimated_unbilled - a.estimated_unbilled),
    }
  }
  return { period: input.period, clients: clients.sort((a, b) => b.total_hours - a.total_hours) }
}

async function runGetBillabilityReport(db: any, workspaceId: string, userId: string, role: string, input: any) {
  const canSeeAll = ['admin', 'partner'].includes(role)
  const { start, end } = getPeriodBounds(input.period)

  let q = db.from('time_entries')
    .select('user_id, duration_sec, billable, hourly_rate, project:projects(hourly_rate), profile:profiles(full_name)')
    .eq('workspace_id', workspaceId).not('end_time', 'is', null)
    .gte('start_time', start.toISOString()).lte('start_time', end.toISOString())
  if (!canSeeAll) q = q.eq('user_id', userId)
  const { data: entries, error } = await q
  if (error) return { error: error.message }
  let rows: any[] = entries || []
  if (input.user_name) rows = rows.filter((e: any) => e.profile?.full_name?.toLowerCase().includes(input.user_name.toLowerCase()))

  // Get members for targets
  const { data: members } = await db.from('workspace_members')
    .select('user_id, weekly_hours, profile:profiles(full_name)').eq('workspace_id', workspaceId).eq('status', 'active')

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  const wdays = Math.round(days * 5 / 7)

  // Aggregate per user
  const byUser: Record<string, { name: string; total: number; billable: number; revenue: number }> = {}
  for (const e of rows) {
    const uid = e.user_id; const n = e.profile?.full_name || uid
    if (!byUser[uid]) byUser[uid] = { name: n, total: 0, billable: 0, revenue: 0 }
    const h = (e.duration_sec || 0) / 3600
    const rate = e.hourly_rate || e.project?.hourly_rate || 0
    byUser[uid].total += h
    if (e.billable) { byUser[uid].billable += h; byUser[uid].revenue += h * rate }
  }

  if (input.metric === 'billability') {
    const stats = Object.values(byUser).map(u => ({
      name: u.name,
      total_hours: Math.round(u.total * 10) / 10,
      billable_hours: Math.round(u.billable * 10) / 10,
      billability_pct: u.total > 0 ? Math.round(u.billable / u.total * 100) : 0,
    })).sort((a, b) => b.billability_pct - a.billability_pct)
    const teamTotal = Object.values(byUser).reduce((s, u) => s + u.total, 0)
    const teamBillable = Object.values(byUser).reduce((s, u) => s + u.billable, 0)
    return { period: input.period, team_billability_pct: teamTotal > 0 ? Math.round(teamBillable / teamTotal * 100) : 0, by_consultant: stats }
  }

  if (input.metric === 'overtime') {
    const result = (members || []).map((m: any) => {
      const u = byUser[m.user_id]
      const target = m.weekly_hours ? m.weekly_hours * wdays / 5 : null
      const logged = u?.total || 0
      return { name: m.profile?.full_name || 'Unknown', hours_logged: Math.round(logged * 10) / 10, target_hours: target ? Math.round(target * 10) / 10 : null, overtime: target ? Math.round((logged - target) * 10) / 10 : null }
    }).filter((m: any) => m.overtime !== null && m.overtime > 0).sort((a: any, b: any) => b.overtime - a.overtime)
    return { period: input.period, overtime_consultants: result }
  }

  if (input.metric === 'zero_hours') {
    const withHours = new Set(Object.keys(byUser).filter(uid => byUser[uid].total > 0))
    const zero = (members || []).filter((m: any) => !withHours.has(m.user_id)).map((m: any) => m.profile?.full_name || m.user_id)
    return { period: input.period, consultants_with_zero_hours: zero }
  }

  if (input.metric === 'effective_rate') {
    const rates = Object.values(byUser)
      .filter(u => u.billable > 0)
      .map(u => ({ name: u.name, billable_hours: Math.round(u.billable * 10) / 10, revenue: Math.round(u.revenue), effective_rate: Math.round(u.revenue / u.billable) }))
      .sort((a, b) => b.effective_rate - a.effective_rate)
    return { period: input.period, effective_rates: rates }
  }

  if (input.metric === 'non_billable_cost') {
    const avgRate = (() => { let r = 0, h = 0; for (const u of Object.values(byUser)) { r += u.revenue; h += u.billable }; return h > 0 ? r / h : 0 })()
    const stats = Object.values(byUser).map(u => {
      const nonBillable = u.total - u.billable
      return { name: u.name, non_billable_hours: Math.round(nonBillable * 10) / 10, revenue_opportunity_lost: Math.round(nonBillable * avgRate) }
    }).sort((a, b) => b.revenue_opportunity_lost - a.revenue_opportunity_lost)
    const totalLost = stats.reduce((s, u) => s + u.revenue_opportunity_lost, 0)
    return { period: input.period, team_avg_rate: Math.round(avgRate), total_revenue_opportunity_lost: totalLost, by_consultant: stats }
  }

  return { error: 'Unknown metric' }
}

async function runGetProjectActivity(db: any, workspaceId: string, role: string, managedIds: string[], input: any) {
  if (role === 'member') return { error: 'No permission.' }
  let q = db.from('projects').select('id, name, end_date, budget_hours, budget_amount, hourly_rate, client:clients(name)').eq('workspace_id', workspaceId).is('deleted_at', null).eq('status', 'active')
  if (role === 'project_manager' && managedIds.length) q = q.in('id', managedIds)
  const { data: projects } = await q
  if (!projects?.length) return { result: 'No active projects found.' }

  if (input.metric === 'idle') {
    const idleDays = input.idle_days || 14
    const since = new Date(); since.setDate(since.getDate() - idleDays)
    const { data: recent } = await db.from('time_entries').select('project_id').eq('workspace_id', workspaceId).not('end_time', 'is', null).gte('start_time', since.toISOString()).in('project_id', projects.map((p: any) => p.id))
    const activeIds = new Set((recent || []).map((e: any) => e.project_id))
    const idle = projects.filter((p: any) => !activeIds.has(p.id)).map((p: any) => ({ name: p.name, client: (p.client as any)?.name || null }))
    return { idle_projects: idle, threshold_days: idleDays }
  }

  if (input.metric === 'near_deadline') {
    const lookAhead = input.deadline_days || 30
    const now = new Date(); const future = new Date(); future.setDate(future.getDate() + lookAhead)
    const near = projects
      .filter((p: any) => p.end_date && new Date(p.end_date) >= now && new Date(p.end_date) <= future)
      .map((p: any) => ({ name: p.name, client: (p.client as any)?.name || null, deadline: p.end_date, days_remaining: Math.round((new Date(p.end_date).getTime() - now.getTime()) / 86400000) }))
      .sort((a: any, b: any) => a.days_remaining - b.days_remaining)
    return { projects_near_deadline: near, within_days: lookAhead }
  }

  if (input.metric === 'budget_remaining') {
    const ago = new Date(); ago.setMonth(ago.getMonth() - 6)
    const { data: entries } = await db.from('time_entries').select('project_id, duration_sec').eq('workspace_id', workspaceId).not('end_time', 'is', null).gte('start_time', ago.toISOString()).in('project_id', projects.map((p: any) => p.id))
    const hrs: Record<string, number> = {}
    for (const e of entries || []) hrs[e.project_id] = (hrs[e.project_id] || 0) + (e.duration_sec || 0) / 3600
    const withBudget = projects.filter((p: any) => p.budget_hours).map((p: any) => {
      const spent = hrs[p.id] || 0
      const remaining = p.budget_hours - spent
      return { name: p.name, client: (p.client as any)?.name || null, budget_hours: p.budget_hours, hours_spent: Math.round(spent * 10) / 10, hours_remaining: Math.round(remaining * 10) / 10, pct_used: Math.round(spent / p.budget_hours * 100), revenue_remaining: p.hourly_rate ? Math.round(remaining * p.hourly_rate) : null }
    }).sort((a: any, b: any) => b.pct_used - a.pct_used)
    const totalRemaining = withBudget.reduce((s: number, p: any) => s + p.hours_remaining, 0)
    const totalRevenueLeft = withBudget.reduce((s: number, p: any) => s + (p.revenue_remaining || 0), 0)
    return { total_hours_remaining: Math.round(totalRemaining * 10) / 10, total_revenue_remaining: Math.round(totalRevenueLeft), projects: withBudget }
  }

  return { error: 'Unknown metric' }
}

async function runGetTimesheetAnalytics(db: any, workspaceId: string, role: string, input: any) {
  if (!['admin', 'partner'].includes(role)) return { error: 'No permission.' }
  const weeksBack = input.weeks_back || 8

  const { data: members } = await db.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', workspaceId).eq('status', 'active')

  if (input.metric === 'never_submitted') {
    const { data: submitted } = await db.from('timesheets').select('user_id').eq('workspace_id', workspaceId)
    const everSubmitted = new Set((submitted || []).map((t: any) => t.user_id))
    const never = (members || []).filter((m: any) => !everSubmitted.has(m.user_id)).map((m: any) => (m.profile as any)?.full_name || m.user_id)
    return { consultants_never_submitted: never }
  }

  if (input.metric === 'status_breakdown') {
    const { data: ts } = await db.from('timesheets').select('status, user_id').eq('workspace_id', workspaceId)
    const counts: Record<string, number> = {}
    for (const t of ts || []) counts[t.status] = (counts[t.status] || 0) + 1
    return { total_timesheets: (ts || []).length, by_status: counts }
  }

  if (input.metric === 'late_submissions') {
    const since = new Date(); since.setDate(since.getDate() - weeksBack * 7)
    const { data: ts } = await db.from('timesheets').select('user_id, week_start, submitted_at, profile:profiles(full_name)').eq('workspace_id', workspaceId).not('submitted_at', 'is', null).gte('week_start', since.toISOString().slice(0, 10))
    const lateByUser: Record<string, { name: string; late: number; onTime: number }> = {}
    for (const t of ts || []) {
      const uid = t.user_id; const name = (t.profile as any)?.full_name || uid
      if (!lateByUser[uid]) lateByUser[uid] = { name, late: 0, onTime: 0 }
      // Late = submitted more than 2 days after week ended (week_start + 7 days)
      const weekEnd = new Date(t.week_start); weekEnd.setDate(weekEnd.getDate() + 9)
      const submittedAt = new Date(t.submitted_at)
      if (submittedAt > weekEnd) lateByUser[uid].late++; else lateByUser[uid].onTime++
    }
    return { weeks_analysed: weeksBack, consultants: Object.values(lateByUser).sort((a, b) => b.late - a.late).map(u => ({ ...u, late_rate_pct: Math.round(u.late / (u.late + u.onTime) * 100) })) }
  }

  return { error: 'Unknown metric' }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI not configured. Add MISTRAL_API_KEY to Vercel environment variables.' }, { status: 500 })

    const serverDb = await createServerClient()
    const { data: { user }, error: authError } = await serverDb.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const { messages, workspaceId, proxyUserId } = body || {}
    if (!messages || !workspaceId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: membership } = await adminDb
      .from('workspace_members').select('role, profile:profiles(full_name)')
      .eq('workspace_id', workspaceId).eq('user_id', user.id).eq('status', 'active').single()
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const role = membership.role as string

    // Proxy mode: admin viewing data as another user
    // Verify the real user is an admin before trusting proxyUserId
    let effectiveUserId = user.id
    let effectiveRole = role
    let userName = (membership.profile as any)?.full_name || 'the user'

    if (proxyUserId && role === 'admin' && proxyUserId !== user.id) {
      const { data: proxyMembership } = await adminDb
        .from('workspace_members').select('role, profile:profiles(full_name)')
        .eq('workspace_id', workspaceId).eq('user_id', proxyUserId).eq('status', 'active').single()
      if (proxyMembership) {
        effectiveUserId = proxyUserId
        effectiveRole = proxyMembership.role as string
        userName = (proxyMembership.profile as any)?.full_name || 'the proxied user'
      }
    }

    let managedIds: string[] = []
    if (effectiveRole === 'project_manager') {
      const { data } = await adminDb.from('projects').select('id').eq('workspace_id', workspaceId).eq('manager_id', effectiveUserId).is('deleted_at', null)
      managedIds = (data || []).map((p: any) => p.id)
    }

    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const systemPrompt = `You are Kairos AI, a helpful assistant in a time-tracking app. Today is ${today}. You are speaking with ${userName} (role: ${effectiveRole}). Use tools to fetch real data — never make up numbers. Be concise and friendly. Format numbers like "12.5 hours" or "€ 3,200". admin/partner see all team data; project_manager sees managed projects; member sees own data only.`

    // Build message list for Mistral (OpenAI-compatible format)
    const mistralMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ]

    // Agentic tool-use loop
    let loopCount = 0
    while (loopCount < 5) {
      const res = await fetch(MISTRAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL, messages: mistralMessages, tools: TOOLS, tool_choice: 'auto' }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Mistral ${res.status}: ${errText}`)
      }

      const data = await res.json()
      const choice = data.choices?.[0]
      const message = choice?.message
      const finishReason = choice?.finish_reason

      // Add assistant message to history
      mistralMessages.push(message)

      if (finishReason === 'stop' || !message?.tool_calls?.length) {
        return NextResponse.json({ reply: message?.content || 'Sorry, I could not generate a response.' })
      }

      loopCount++

      // Execute each tool call
      for (const toolCall of message.tool_calls) {
        let result: unknown
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          const name = toolCall.function.name
          if (name === 'get_hours_summary') result = await runGetHoursSummary(adminDb, workspaceId, effectiveUserId, effectiveRole, args)
          else if (name === 'get_project_status') result = await runGetProjectStatus(adminDb, workspaceId, effectiveRole, managedIds, args)
          else if (name === 'get_team_overview') result = await runGetTeamOverview(adminDb, workspaceId, effectiveRole, args)
          else if (name === 'get_timesheet_status') result = await runGetTimesheetStatus(adminDb, workspaceId, effectiveRole, args)
          else if (name === 'get_revenue_summary') result = await runGetRevenueSummary(adminDb, workspaceId, effectiveRole, managedIds, args)
          else if (name === 'get_invoice_status') result = await runGetInvoiceStatus(adminDb, workspaceId, effectiveRole, args)
          else if (name === 'get_budget_burndown') result = await runGetBudgetBurndown(adminDb, workspaceId, effectiveRole, managedIds, args)
          else if (name === 'get_client_analysis') result = await runGetClientAnalysis(adminDb, workspaceId, effectiveRole, managedIds, args)
          else if (name === 'get_billability_report') result = await runGetBillabilityReport(adminDb, workspaceId, effectiveUserId, effectiveRole, args)
          else if (name === 'get_project_activity') result = await runGetProjectActivity(adminDb, workspaceId, effectiveRole, managedIds, args)
          else if (name === 'get_timesheet_analytics') result = await runGetTimesheetAnalytics(adminDb, workspaceId, effectiveRole, args)
          else result = { error: 'Unknown tool' }
        } catch (e: any) {
          result = { error: e.message || 'Tool failed' }
        }

        mistralMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }
    }

    return NextResponse.json({ reply: 'Sorry, I could not complete the request.' })
  } catch (err: any) {
    console.error('[AI chat error]', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
