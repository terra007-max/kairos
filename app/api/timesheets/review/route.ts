import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })

  // Identify the calling user via the session cookie
  const serverSupabase = await createServerClient()
  const { data: { user }, error: authError } = await serverSupabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { timesheetId, status, reviewerNote, workspaceId } = body || {}

  if (!timesheetId || !workspaceId || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Check caller is admin OR project manager for this timesheet's user
  const { data: membership } = await adminSupabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (membership.role !== 'admin') {
    // Must be PM of a project the timesheet user worked on
    const { data: ts } = await adminSupabase
      .from('timesheets')
      .select('user_id, week_start')
      .eq('id', timesheetId)
      .single()

    if (!ts) return NextResponse.json({ error: 'Timesheet not found.' }, { status: 404 })

    const { count } = await adminSupabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('manager_id', user.id)
      .is('deleted_at', null)
      .in('id',
        (await adminSupabase
          .from('time_entries')
          .select('project_id')
          .eq('user_id', ts.user_id)
          .eq('workspace_id', workspaceId)
          .not('project_id', 'is', null)
          .then(r => (r.data || []).map((e: any) => e.project_id))
        )
      )

    if (!count || count === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch current history and apply update
  const { data: current } = await adminSupabase
    .from('timesheets')
    .select('review_history')
    .eq('id', timesheetId)
    .single()

  const history = [...((current?.review_history as any[]) || []), {
    status,
    note: reviewerNote || null,
    reviewed_at: new Date().toISOString(),
    reviewed_by_id: user.id,
  }]

  const { error } = await adminSupabase
    .from('timesheets')
    .update({
      status,
      reviewer_note: reviewerNote || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      review_history: history,
    })
    .eq('id', timesheetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
