import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Verify caller is an active admin
  const supabaseUser = createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

  const { data: membership } = await supabaseUser
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Get all user_ids already in this workspace
  const { data: existingMembers } = await adminSupabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .not('user_id', 'is', null)

  const existingIds = (existingMembers || []).map((m: any) => m.user_id)

  // Get all profiles not in this workspace
  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name')
    .not('id', 'in', existingIds.length ? `(${existingIds.join(',')})` : '(00000000-0000-0000-0000-000000000000)')

  return NextResponse.json({ users: profiles || [] })
}

export async function POST(req: NextRequest) {
  // Verify caller is an active admin
  const supabaseUser = createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { workspaceId, userId, email } = body || {}
  if (!workspaceId || !userId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: membership } = await supabaseUser
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await adminSupabase.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: userId,
    email: email || '',
    role: 'member',
    status: 'active',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
