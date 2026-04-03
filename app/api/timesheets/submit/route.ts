import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })

  const serverSupabase = await createServerClient()
  const { data: { user }, error: authError } = await serverSupabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { workspaceId, weekStart, note, action, timesheetId, proxyUserId } = body || {}

  if (!workspaceId || !action || !['submit', 'withdraw'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify caller's membership
  const { data: membership } = await adminSupabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // If proxying, caller must be admin or partner
  if (proxyUserId && proxyUserId !== user.id) {
    if (membership.role !== 'admin' && membership.role !== 'partner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const targetUserId = (proxyUserId && proxyUserId !== user.id) ? proxyUserId : user.id

  if (action === 'submit') {
    if (!weekStart) return NextResponse.json({ error: 'weekStart required.' }, { status: 400 })

    if (timesheetId) {
      // Verify timesheet belongs to target user and workspace
      const { data: ts } = await adminSupabase
        .from('timesheets')
        .select('id, status')
        .eq('id', timesheetId)
        .eq('workspace_id', workspaceId)
        .eq('user_id', targetUserId)
        .single()

      if (!ts) return NextResponse.json({ error: 'Timesheet not found.' }, { status: 404 })

      const wasRejected = ts.status === 'rejected'
      const { error } = await adminSupabase
        .from('timesheets')
        .update({
          status: 'submitted',
          note: note || null,
          submitted_at: new Date().toISOString(),
          ...(wasRejected ? { project_approvals: {}, reviewer_note: null } : {}),
        })
        .eq('id', timesheetId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await adminSupabase
        .from('timesheets')
        .insert({
          user_id: targetUserId,
          workspace_id: workspaceId,
          week_start: weekStart,
          status: 'submitted',
          note: note || null,
          submitted_at: new Date().toISOString(),
        })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (action === 'withdraw') {
    if (!timesheetId) return NextResponse.json({ error: 'timesheetId required.' }, { status: 400 })

    const { data: ts } = await adminSupabase
      .from('timesheets')
      .select('id')
      .eq('id', timesheetId)
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId)
      .single()

    if (!ts) return NextResponse.json({ error: 'Timesheet not found.' }, { status: 404 })

    const { error } = await adminSupabase
      .from('timesheets')
      .update({ status: 'draft', submitted_at: null })
      .eq('id', timesheetId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
