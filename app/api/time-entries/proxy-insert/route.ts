import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Allows admins to insert time entries on behalf of proxied users,
// bypassing RLS which would block auth.uid() ≠ user_id inserts.
export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })

  // Verify the caller is authenticated
  const serverSupabase = await createServerClient()
  const { data: { user }, error: authError } = await serverSupabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { entry, workspaceId, targetUserId } = body || {}
  if (!entry || !workspaceId || !targetUserId) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Verify the caller is an admin in this workspace
  const adminSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
  const { data: membership } = await adminSupabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership || !['admin', 'partner'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const { data, error } = await adminSupabase
    .from('time_entries')
    .insert({ ...entry, user_id: targetUserId, workspace_id: workspaceId })
    .select('*, project:projects(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
