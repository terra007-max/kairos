import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  // 1. Authenticate caller
  const supabaseUser = createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Validate input
  const body = await req.json().catch(() => null)
  const { email, workspaceId } = body || {}
  if (!email || !workspaceId) return NextResponse.json({ error: 'Missing email or workspaceId' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  if (!UUID_RE.test(workspaceId)) return NextResponse.json({ error: 'Invalid workspaceId' }, { status: 400 })

  // 3. Verify caller is an admin of the target workspace
  const { data: membership } = await supabaseUser
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 })
  }

  // 4. Require service role key — no insecure fallback
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfiguration: invite emails not available' }, { status: 500 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  if (!appUrl) {
    return NextResponse.json({ error: 'Server misconfiguration: NEXT_PUBLIC_APP_URL is not set' }, { status: 500 })
  }

  const { error } = await adminSupabase.auth.admin.inviteUserByEmail(email.toLowerCase(), {
    redirectTo: `${appUrl}/invite?workspace=${workspaceId}`,
    data: { workspace_id: workspaceId },
  })

  if (error && error.message !== 'User already registered') {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 5. Upsert workspace_members (for both new and existing users)
  await adminSupabase.from('workspace_members').upsert({
    workspace_id: workspaceId,
    email: email.toLowerCase(),
    role: 'member',
    status: 'pending',
  }, { onConflict: 'workspace_id,email' })

  return NextResponse.json({ success: true })
}
