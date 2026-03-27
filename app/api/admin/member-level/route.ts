import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  // Verify caller is an admin
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { memberId, levelId, weeklyHours, workspaceId } = await req.json()
  if (!memberId || !workspaceId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (weeklyHours !== undefined && (typeof weeklyHours !== 'number' || weeklyHours < 0 || weeklyHours > 40)) {
    return NextResponse.json({ error: 'weeklyHours must be 0–40' }, { status: 400 })
  }

  // Verify caller is admin of this workspace
  const { data: callerRow } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (callerRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const patch: Record<string, unknown> = { level_id: levelId || null }
  if (weeklyHours !== undefined) patch.weekly_hours = weeklyHours

  const { error } = await adminSupabase
    .from('workspace_members')
    .update(patch)
    .eq('id', memberId)
    .eq('workspace_id', workspaceId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
