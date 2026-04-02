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
  const { timesheetId, status, reviewerNote, workspaceId, projectId } = body || {}

  if (!timesheetId || !workspaceId || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: membership } = await adminSupabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdminOrPartner = membership.role === 'admin' || membership.role === 'partner'

  // Fetch timesheet — enforce workspace_id so a reviewer from workspace A
  // cannot touch timesheets belonging to workspace B
  const { data: ts } = await adminSupabase
    .from('timesheets')
    .select('user_id, week_start, review_history, project_approvals')
    .eq('id', timesheetId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!ts) return NextResponse.json({ error: 'Timesheet not found.' }, { status: 404 })

  if (!isAdminOrPartner) {
    // PM: must have a projectId and must manage that project
    if (!projectId) return NextResponse.json({ error: 'projectId required for PM approval.' }, { status: 400 })

    const { data: managedProject } = await adminSupabase
      .from('projects')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('manager_id', user.id)
      .eq('id', projectId)
      .is('deleted_at', null)
      .single()

    if (!managedProject) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Verify the timesheet user actually tracked time on this project in that week
    const weekStart = new Date(ts.week_start)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const { count } = await adminSupabase
      .from('time_entries')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('user_id', ts.user_id)
      .eq('project_id', projectId)
      .gte('start_time', weekStart.toISOString())
      .lt('start_time', weekEnd.toISOString())

    if (!count || count === 0) return NextResponse.json({ error: 'No entries on this project for this week.' }, { status: 403 })

    // Update per-project approval
    const currentApprovals = (ts.project_approvals as Record<string, any>) || {}
    const updatedApprovals: Record<string, any> = {
      ...currentApprovals,
      [projectId]: { status, by: user.id, at: new Date().toISOString() },
    }

    // Check if all projects with PMs in this timesheet are now approved
    const weekStartDate = new Date(ts.week_start)
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 7)

    const { data: entries } = await adminSupabase
      .from('time_entries')
      .select('project_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', ts.user_id)
      .not('project_id', 'is', null)
      .gte('start_time', weekStartDate.toISOString())
      .lt('start_time', weekEndDate.toISOString())

    const projectIds = Array.from(new Set((entries || []).map((e: any) => e.project_id)))

    // For each project, check if it has a PM
    const { data: projectsWithPMs } = await adminSupabase
      .from('projects')
      .select('id')
      .in('id', projectIds)
      .not('manager_id', 'is', null)
      .is('deleted_at', null)

    const projectsNeedingApproval = (projectsWithPMs || []).map((p: any) => p.id)

    // Determine overall status.
    // If no projects have PMs, a PM cannot auto-approve the whole timesheet —
    // that would require an admin/partner action.
    let overallStatus: 'submitted' | 'approved' | 'rejected' = 'submitted'
    if (status === 'rejected') {
      overallStatus = 'rejected'
    } else if (projectsNeedingApproval.length > 0) {
      const allApproved = projectsNeedingApproval.every(
        pid => updatedApprovals[pid]?.status === 'approved'
      )
      if (allApproved) overallStatus = 'approved'
    }
    // else: no PM-managed projects → stay 'submitted', admin must approve

    const history = [...((ts.review_history as any[]) || []), {
      status: overallStatus === 'submitted' ? 'partial' : overallStatus,
      project_id: projectId,
      note: reviewerNote || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by_id: user.id,
    }]

    const { error } = await adminSupabase
      .from('timesheets')
      .update({
        project_approvals: updatedApprovals,
        status: overallStatus,
        reviewer_note: reviewerNote || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        review_history: history,
      })
      .eq('id', timesheetId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Admin / Partner: approve or reject the whole timesheet directly
  const history = [...((ts.review_history as any[]) || []), {
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
      // Clear per-project approvals when returning a timesheet so the
      // next review cycle starts with a clean slate
      ...(status === 'rejected' ? { project_approvals: {} } : {}),
    })
    .eq('id', timesheetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
