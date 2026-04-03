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
      name: 'get_team_overview',
      description: 'Get team hours and utilization vs weekly targets. period: this_week|last_week|this_month.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'this_week, last_week, or this_month' },
        },
        required: ['period'],
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
  return { period: input.period, team: (members || []).map((m: any) => {
    const h = Math.round((hrs[m.user_id] || 0) * 10) / 10
    const target = m.weekly_hours ? Math.round(m.weekly_hours * wdays / 5 * 10) / 10 : null
    return { name: m.profile?.full_name || 'Unknown', hours_logged: h, target_hours: target, utilization_pct: target ? Math.round(h / target * 100) : null }
  }).sort((a: any, b: any) => b.hours_logged - a.hours_logged) }
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
