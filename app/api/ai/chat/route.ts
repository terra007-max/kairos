import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Tools Claude can call ────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_hours_summary',
    description: 'Get total hours worked, optionally filtered by user, project, and date range. Use this to answer questions like "how many hours did X work last week" or "total hours on project Y this month".',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['this_week', 'last_week', 'this_month', 'last_month', 'last_3_months'],
          description: 'Time period to query',
        },
        user_name: { type: 'string', description: 'Filter by member name (partial match, optional)' },
        project_name: { type: 'string', description: 'Filter by project name (partial match, optional)' },
        group_by: {
          type: 'string',
          enum: ['user', 'project', 'day', 'none'],
          description: 'How to group the results',
        },
      },
      required: ['period', 'group_by'],
    },
  },
  {
    name: 'get_project_status',
    description: 'Get project budget, hours spent, and estimated revenue. Use this for questions about project progress, budget burn, or which projects are active.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Filter by project name (partial match, optional — omit for all projects)' },
        include_inactive: { type: 'boolean', description: 'Include archived/deleted projects (default false)' },
      },
      required: [],
    },
  },
  {
    name: 'get_team_overview',
    description: 'Get a high-level summary of who is working, their hours this week vs last week, and utilization vs their weekly target. Good for "how is the team doing" questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['this_week', 'last_week', 'this_month'],
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_timesheet_status',
    description: 'Get timesheet submission and approval status for the team. Good for "who has submitted their timesheet" or "what timesheets are pending review".',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['current_week', 'last_week'],
        },
      },
      required: ['period'],
    },
  },
]

// ── Date helpers ─────────────────────────────────────────────────────────────

function getPeriodBounds(period: string): { start: Date; end: Date } {
  const now = new Date()
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1 // Mon=0
  const thisMonStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
  const thisWeekStart = new Date(todayMs - dayOfWeek * 86400000)
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000)
  const lastWeekEnd   = new Date(thisWeekStart.getTime() - 1000)

  switch (period) {
    case 'this_week':   return { start: thisWeekStart, end: new Date(now) }
    case 'last_week':   return { start: lastWeekStart, end: lastWeekEnd }
    case 'this_month':  return { start: thisMonStart,  end: new Date(now) }
    case 'last_month':  return { start: lastMonStart,  end: lastMonEnd }
    case 'last_3_months': return { start: new Date(now.getFullYear(), now.getMonth() - 3, 1), end: new Date(now) }
    default: return { start: thisWeekStart, end: new Date(now) }
  }
}

// ── Tool executors ────────────────────────────────────────────────────────────

async function runGetHoursSummary(
  adminDb: ReturnType<typeof createClient>,
  workspaceId: string,
  userId: string,
  role: string,
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

  // Non-admins/partners can only see their own data
  if (role === 'member') {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query
  if (error) return { error: error.message }
  if (!data?.length) return { result: 'No time entries found for this period.' }

  let entries = data as any[]

  if (input.project_name) {
    const term = input.project_name.toLowerCase()
    entries = entries.filter(e => e.project?.name?.toLowerCase().includes(term))
  }
  if (input.user_name && role !== 'member') {
    const term = input.user_name.toLowerCase()
    entries = entries.filter(e => e.profile?.full_name?.toLowerCase().includes(term))
  }

  if (!entries.length) return { result: 'No matching entries found.' }

  const totalHours = entries.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0) / 3600

  if (input.group_by === 'none') {
    return { total_hours: Math.round(totalHours * 10) / 10, entry_count: entries.length }
  }

  if (input.group_by === 'user') {
    const byUser: Record<string, number> = {}
    for (const e of entries) {
      const name = e.profile?.full_name || e.user_id || 'Unknown'
      byUser[name] = (byUser[name] || 0) + (e.duration_sec || 0) / 3600
    }
    return {
      total_hours: Math.round(totalHours * 10) / 10,
      by_user: Object.entries(byUser)
        .sort((a, b) => b[1] - a[1])
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
      by_project: Object.entries(byProject)
        .sort((a, b) => b[1] - a[1])
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
      by_day: Object.entries(byDay)
        .sort()
        .map(([date, h]) => ({ date, hours: Math.round(h * 10) / 10 })),
    }
  }

  return { total_hours: Math.round(totalHours * 10) / 10 }
}

async function runGetProjectStatus(
  adminDb: ReturnType<typeof createClient>,
  workspaceId: string,
  role: string,
  managedIds: string[],
  input: { project_name?: string; include_inactive?: boolean }
) {
  let q = adminDb
    .from('projects')
    .select('id, name, budget_hours, budget_amount, hourly_rate, client:clients(name)')
    .eq('workspace_id', workspaceId)

  if (!input.include_inactive) q = q.is('deleted_at', null)
  if (input.project_name) q = q.ilike('name', `%${input.project_name}%`)

  // PMs only see their own projects
  if (role === 'project_manager' && managedIds.length) {
    q = q.in('id', managedIds)
  } else if (role === 'member') {
    return { error: 'You do not have permission to view project summaries.' }
  }

  const { data: projects, error } = await q
  if (error) return { error: error.message }
  if (!projects?.length) return { result: 'No projects found.' }

  // Get hours spent per project (last 6 months)
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const { data: entries } = await adminDb
    .from('time_entries')
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
        hourly_rate: p.hourly_rate || null,
        estimated_revenue: p.hourly_rate ? Math.round(spent * p.hourly_rate) : null,
      }
    }),
  }
}

async function runGetTeamOverview(
  adminDb: ReturnType<typeof createClient>,
  workspaceId: string,
  role: string,
  input: { period: string }
) {
  if (role === 'member') return { error: 'You do not have permission to view team data.' }

  const { start, end } = getPeriodBounds(input.period)

  const { data: members } = await adminDb
    .from('workspace_members')
    .select('user_id, weekly_hours, profile:profiles(full_name)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  const { data: entries } = await adminDb
    .from('time_entries')
    .select('user_id, duration_sec')
    .eq('workspace_id', workspaceId)
    .not('end_time', 'is', null)
    .gte('start_time', start.toISOString())
    .lte('start_time', end.toISOString())

  const hoursByUser: Record<string, number> = {}
  for (const e of entries || []) {
    hoursByUser[e.user_id] = (hoursByUser[e.user_id] || 0) + (e.duration_sec || 0) / 3600
  }

  const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  const workingDays = Math.round(periodDays * 5 / 7)

  return {
    period: input.period,
    team: (members || []).map((m: any) => {
      const name = m.profile?.full_name || m.user_id || 'Unknown'
      const hours = Math.round((hoursByUser[m.user_id] || 0) * 10) / 10
      const target = m.weekly_hours ? Math.round(m.weekly_hours * (workingDays / 5) * 10) / 10 : null
      const util = target ? Math.round((hours / target) * 100) : null
      return { name, hours_logged: hours, target_hours: target, utilization_pct: util }
    }).sort((a: any, b: any) => b.hours_logged - a.hours_logged),
  }
}

async function runGetTimesheetStatus(
  adminDb: ReturnType<typeof createClient>,
  workspaceId: string,
  role: string,
  input: { period: string }
) {
  if (role === 'member') return { error: 'You do not have permission to view team timesheet data.' }

  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1
  const thisWeekStart = new Date(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - dayOfWeek * 86400000)
  const weekStart = input.period === 'last_week'
    ? new Date(thisWeekStart.getTime() - 7 * 86400000)
    : thisWeekStart

  const weekStartStr = weekStart.toISOString().slice(0, 10)

  const { data: timesheets } = await adminDb
    .from('timesheets')
    .select('user_id, status, submitted_at, profile:profiles(full_name)')
    .eq('workspace_id', workspaceId)
    .eq('week_start', weekStartStr)

  const { data: members } = await adminDb
    .from('workspace_members')
    .select('user_id, profile:profiles(full_name)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  const submittedIds = new Set((timesheets || []).map((t: any) => t.user_id))
  const notSubmitted = (members || [])
    .filter((m: any) => !submittedIds.has(m.user_id))
    .map((m: any) => (m.profile as any)?.full_name || m.user_id)

  const statusGroups: Record<string, string[]> = {}
  for (const ts of timesheets || []) {
    const name = (ts.profile as any)?.full_name || ts.user_id
    statusGroups[ts.status] = [...(statusGroups[ts.status] || []), name]
  }

  return {
    week: weekStartStr,
    not_submitted: notSubmitted,
    ...statusGroups,
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured.' }, { status: 500 })

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

  // Verify membership and get role
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

  // Get managed project IDs for PMs
  let managedProjectIds: string[] = []
  if (role === 'project_manager') {
    const { data: managed } = await adminDb
      .from('projects')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('manager_id', user.id)
      .is('deleted_at', null)
    managedProjectIds = (managed || []).map((p: any) => p.id)
  }

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const systemPrompt = `You are Kairos AI, a helpful assistant built into a time-tracking platform called Kairos.
Today is ${today}. You are speaking with ${userName} who has the role "${role}" in this workspace.

You help users understand their time-tracking data by answering questions in natural language.
Use the available tools to fetch real data — never make up numbers.
Keep answers concise and friendly. Format numbers nicely (e.g. "12.5 hours", "€ 3,200").
When showing lists, use bullet points or short tables.
If a question is outside your data scope (e.g. general knowledge), politely redirect.

Role-based access:
- admin / partner: can see all team data
- project_manager: can see their managed projects and team hours
- member: can only see their own data`

  // Agentic loop: Claude calls tools, we execute them, loop until done
  const claudeMessages: Anthropic.MessageParam[] = messages

  let response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    tools: TOOLS,
    messages: claudeMessages,
  })

  // Tool use loop
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of toolUseBlocks) {
      let result: unknown
      try {
        if (block.name === 'get_hours_summary') {
          result = await runGetHoursSummary(adminDb, workspaceId, user.id, role, block.input as any)
        } else if (block.name === 'get_project_status') {
          result = await runGetProjectStatus(adminDb, workspaceId, role, managedProjectIds, block.input as any)
        } else if (block.name === 'get_team_overview') {
          result = await runGetTeamOverview(adminDb, workspaceId, role, block.input as any)
        } else if (block.name === 'get_timesheet_status') {
          result = await runGetTimesheetStatus(adminDb, workspaceId, role, block.input as any)
        } else {
          result = { error: 'Unknown tool' }
        }
      } catch (e: any) {
        result = { error: e.message || 'Tool execution failed' }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    // Feed results back to Claude
    response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: [
        ...claudeMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ],
    })
  }

  const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined
  return NextResponse.json({ reply: textBlock?.text || 'Sorry, I could not generate a response.' })
}
