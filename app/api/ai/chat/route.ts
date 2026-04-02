import { GoogleGenerativeAI, FunctionDeclaration } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── Tool declarations for Gemini ─────────────────────────────────────────────

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_hours_summary',
    description: 'Get total hours worked. period: this_week|last_week|this_month|last_month|last_3_months. group_by: user|project|day|none.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Time period: this_week, last_week, this_month, last_month, last_3_months' },
        user_name: { type: 'string', description: 'Filter by member name (optional)' },
        project_name: { type: 'string', description: 'Filter by project name (optional)' },
        group_by: { type: 'string', description: 'Group results by: user, project, day, or none' },
      },
      required: ['period', 'group_by'],
    } as any,
  },
  {
    name: 'get_project_status',
    description: 'Get project budget, hours spent, and estimated revenue for one or all projects.',
    parameters: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Filter by project name (optional, omit for all)' },
        include_inactive: { type: 'boolean', description: 'Include archived projects' },
      },
    } as any,
  },
  {
    name: 'get_team_overview',
    description: 'Get team hours and utilization. period: this_week|last_week|this_month.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Time period: this_week, last_week, this_month' },
      },
      required: ['period'],
    } as any,
  },
  {
    name: 'get_timesheet_status',
    description: 'Get timesheet submission status. period: current_week|last_week.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'current_week or last_week' },
      },
      required: ['period'],
    } as any,
  },
]

// ── Date helpers ─────────────────────────────────────────────────────────────

function getPeriodBounds(period: string): { start: Date; end: Date } {
  const now = new Date()
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1
  const thisWeekStart = new Date(todayMs - dayOfWeek * 86400000)
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000)
  const lastWeekEnd   = new Date(thisWeekStart.getTime() - 1000)
  const thisMonStart  = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonEnd    = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  switch (period) {
    case 'this_week':     return { start: thisWeekStart, end: new Date(now) }
    case 'last_week':     return { start: lastWeekStart, end: lastWeekEnd }
    case 'this_month':    return { start: thisMonStart,  end: new Date(now) }
    case 'last_month':    return { start: lastMonStart,  end: lastMonEnd }
    case 'last_3_months': return { start: new Date(now.getFullYear(), now.getMonth() - 3, 1), end: new Date(now) }
    default:              return { start: thisWeekStart, end: new Date(now) }
  }
}

// ── Tool executors ────────────────────────────────────────────────────────────

async function runGetHoursSummary(
  adminDb: any, workspaceId: string, userId: string, role: string,
  input: { period: string; user_name?: string; project_name?: string; group_by: string }
) {
  const { start, end } = getPeriodBounds(input.period)
  let query = adminDb
    .from('time_entries')
    .select('user_id, duration_sec, start_time, project:projects(name), profile:profiles(full_name)')
    .eq('workspace_id', workspaceId)
    .not('end_time', 'is', null)
    .gte('start_time', start.toISOString())
    .lte('start_time', end.toISOString())

  if (role === 'member') query = query.eq('user_id', userId)

  const { data, error } = await query
  if (error) return { error: error.message }
  if (!data?.length) return { result: 'No time entries found for this period.' }

  let entries = data as any[]
  if (input.project_name) {
    const term = input.project_name.toLowerCase()
    entries = entries.filter((e: any) => e.project?.name?.toLowerCase().includes(term))
  }
  if (input.user_name && role !== 'member') {
    const term = input.user_name.toLowerCase()
    entries = entries.filter((e: any) => e.profile?.full_name?.toLowerCase().includes(term))
  }
  if (!entries.length) return { result: 'No matching entries found.' }

  const totalHours = entries.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0) / 3600

  if (input.group_by === 'user') {
    const byUser: Record<string, number> = {}
    for (const e of entries) {
      const name = e.profile?.full_name || 'Unknown'
      byUser[name] = (byUser[name] || 0) + (e.duration_sec || 0) / 3600
    }
    return {
      total_hours: Math.round(totalHours * 10) / 10,
      by_user: Object.entries(byUser).sort((a, b) => b[1] - a[1])
        .map(([name, h]) => ({ name, hours: Math.round(h * 10) / 10 })),
    }
  }

  if (input.group_by === 'project') {
    const byProject: Record<string, number> = {}
    for (const e of entries) {
      const name = e.project?.name || 'No project'
      byProject[name] = (byProject[name] || 0) + (e.duration_sec || 0) / 3600
    }
    return {
      total_hours: Math.round(totalHours * 10) / 10,
      by_project: Object.entries(byProject).sort((a, b) => b[1] - a[1])
        .map(([name, h]) => ({ name, hours: Math.round(h * 10) / 10 })),
    }
  }

  if (input.group_by === 'day') {
    const byDay: Record<string, number> = {}
    for (const e of entries) {
      const day = e.start_time?.slice(0, 10) || 'unknown'
      byDay[day] = (byDay[day] || 0) + (e.duration_sec || 0) / 3600
    }
    return {
      total_hours: Math.round(totalHours * 10) / 10,
      by_day: Object.entries(byDay).sort()
        .map(([date, h]) => ({ date, hours: Math.round(h * 10) / 10 })),
    }
  }

  return { total_hours: Math.round(totalHours * 10) / 10, entry_count: entries.length }
}

async function runGetProjectStatus(
  adminDb: any, workspaceId: string, role: string, managedIds: string[],
  input: { project_name?: string; include_inactive?: boolean }
) {
  if (role === 'member') return { error: 'No permission to view project summaries.' }

  let q = adminDb.from('projects')
    .select('id, name, budget_hours, budget_amount, hourly_rate, client:clients(name)')
    .eq('workspace_id', workspaceId)
  if (!input.include_inactive) q = q.is('deleted_at', null)
  if (input.project_name) q = q.ilike('name', `%${input.project_name}%`)
  if (role === 'project_manager' && managedIds.length) q = q.in('id', managedIds)

  const { data: projects, error } = await q
  if (error) return { error: error.message }
  if (!projects?.length) return { result: 'No projects found.' }

  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const { data: entries } = await adminDb.from('time_entries')
    .select('project_id, duration_sec')
    .eq('workspace_id', workspaceId)
    .not('end_time', 'is', null)
    .in('project_id', projects.map((p: any) => p.id))
    .gte('start_time', sixMonthsAgo.toISOString())

  const hoursByProject: Record<string, number> = {}
  for (const e of entries || []) {
    hoursByProject[e.project_id] = (hoursByProject[e.project_id] || 0) + (e.duration_sec || 0) / 3600
  }

  return {
    projects: projects.map((p: any) => {
      const spent = Math.round((hoursByProject[p.id] || 0) * 10) / 10
      const budgetH = p.budget_hours
      const pct = budgetH ? Math.round((spent / budgetH) * 100) : null
      return {
        name: p.name,
        client: (p.client as any)?.name || null,
        hours_spent: spent,
        budget_hours: budgetH || null,
        budget_used_pct: pct,
        estimated_revenue: p.hourly_rate ? Math.round(spent * p.hourly_rate) : null,
      }
    }),
  }
}

async function runGetTeamOverview(
  adminDb: any, workspaceId: string, role: string, input: { period: string }
) {
  if (role === 'member') return { error: 'No permission to view team data.' }
  const { start, end } = getPeriodBounds(input.period)

  const { data: members } = await adminDb.from('workspace_members')
    .select('user_id, weekly_hours, profile:profiles(full_name)')
    .eq('workspace_id', workspaceId).eq('status', 'active')

  const { data: entries } = await adminDb.from('time_entries')
    .select('user_id, duration_sec')
    .eq('workspace_id', workspaceId).not('end_time', 'is', null)
    .gte('start_time', start.toISOString()).lte('start_time', end.toISOString())

  const hoursByUser: Record<string, number> = {}
  for (const e of entries || []) {
    hoursByUser[e.user_id] = (hoursByUser[e.user_id] || 0) + (e.duration_sec || 0) / 3600
  }

  const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  const workingDays = Math.round(periodDays * 5 / 7)

  return {
    period: input.period,
    team: (members || []).map((m: any) => {
      const name = m.profile?.full_name || 'Unknown'
      const hours = Math.round((hoursByUser[m.user_id] || 0) * 10) / 10
      const target = m.weekly_hours ? Math.round(m.weekly_hours * (workingDays / 5) * 10) / 10 : null
      const util = target ? Math.round((hours / target) * 100) : null
      return { name, hours_logged: hours, target_hours: target, utilization_pct: util }
    }).sort((a: any, b: any) => b.hours_logged - a.hours_logged),
  }
}

async function runGetTimesheetStatus(
  adminDb: any, workspaceId: string, role: string, input: { period: string }
) {
  if (role === 'member') return { error: 'No permission to view team timesheet data.' }

  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1
  const thisWeekStart = new Date(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - dayOfWeek * 86400000)
  const weekStart = input.period === 'last_week'
    ? new Date(thisWeekStart.getTime() - 7 * 86400000)
    : thisWeekStart
  const weekStartStr = weekStart.toISOString().slice(0, 10)

  const { data: timesheets } = await adminDb.from('timesheets')
    .select('user_id, status, profile:profiles(full_name)')
    .eq('workspace_id', workspaceId).eq('week_start', weekStartStr)

  const { data: members } = await adminDb.from('workspace_members')
    .select('user_id, profile:profiles(full_name)')
    .eq('workspace_id', workspaceId).eq('status', 'active')

  const submittedIds = new Set((timesheets || []).map((t: any) => t.user_id))
  const notSubmitted = (members || [])
    .filter((m: any) => !submittedIds.has(m.user_id))
    .map((m: any) => (m.profile as any)?.full_name || m.user_id)

  const statusGroups: Record<string, string[]> = {}
  for (const ts of timesheets || []) {
    const name = (ts.profile as any)?.full_name || ts.user_id
    statusGroups[ts.status] = [...(statusGroups[ts.status] || []), name]
  }

  return { week: weekStartStr, not_submitted: notSubmitted, ...statusGroups }
}

async function callTool(
  adminDb: any, workspaceId: string, userId: string, role: string, managedIds: string[],
  name: string, args: any
): Promise<unknown> {
  if (name === 'get_hours_summary') return runGetHoursSummary(adminDb, workspaceId, userId, role, args)
  if (name === 'get_project_status') return runGetProjectStatus(adminDb, workspaceId, role, managedIds, args)
  if (name === 'get_team_overview') return runGetTeamOverview(adminDb, workspaceId, role, args)
  if (name === 'get_timesheet_status') return runGetTimesheetStatus(adminDb, workspaceId, role, args)
  return { error: 'Unknown tool' }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI not configured. Add GEMINI_API_KEY to environment.' }, { status: 500 })

    const serverDb = await createServerClient()
    const { data: { user }, error: authError } = await serverDb.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const { messages, workspaceId } = body || {}
    if (!messages || !workspaceId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: membership } = await adminDb
      .from('workspace_members')
      .select('role, profile:profiles(full_name)')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const role = membership.role as string
    const userName = (membership.profile as any)?.full_name || 'the user'

    let managedProjectIds: string[] = []
    if (role === 'project_manager') {
      const { data: managed } = await adminDb.from('projects')
        .select('id').eq('workspace_id', workspaceId).eq('manager_id', user.id).is('deleted_at', null)
      managedProjectIds = (managed || []).map((p: any) => p.id)
    }

    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const systemPrompt = `You are Kairos AI, a helpful assistant built into a time-tracking platform called Kairos.
Today is ${today}. You are speaking with ${userName} who has the role "${role}" in this workspace.
Use the available tools to fetch real data — never make up numbers.
Keep answers concise and friendly. Format numbers nicely (e.g. "12.5 hours", "€ 3,200").
When showing lists, use bullet points. Role access: admin/partner see all team data; project_manager sees managed projects; member sees only own data.`

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: TOOLS }],
    })

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const lastMessage = messages[messages.length - 1].content

    const chat = model.startChat({ history })
    let result = await chat.sendMessage(lastMessage)
    let response = result.response

    // Tool use loop
    let loopCount = 0
    while (loopCount < 5) {
      const fnCalls = response.functionCalls()
      if (!fnCalls || fnCalls.length === 0) break
      loopCount++

      const fnResponses = await Promise.all(fnCalls.map(async (call) => {
        let output: unknown
        try {
          output = await callTool(adminDb, workspaceId, user.id, role, managedProjectIds, call.name, call.args)
        } catch (e: any) {
          output = { error: e.message || 'Tool failed' }
        }
        return { functionResponse: { name: call.name, response: { result: output } } }
      }))

      result = await chat.sendMessage(fnResponses as any)
      response = result.response
    }

    const text = response.text()
    return NextResponse.json({ reply: text || 'Sorry, I could not generate a response.' })
  } catch (err: any) {
    console.error('[AI chat error]', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
