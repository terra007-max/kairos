import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, workspaceId } = await req.json()

  if (!email || !workspaceId) {
    return NextResponse.json({ error: 'Missing email or workspaceId' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    // Fallback: just upsert workspace_members without sending email
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.from('workspace_members').upsert({
      workspace_id: workspaceId,
      email: email.toLowerCase(),
      role: 'member',
      status: 'pending',
    }, { onConflict: 'workspace_id,email' })
    return NextResponse.json({ success: true, emailSent: false })
  }

  // Use service role to send actual invite email
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const { error } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/invite?workspace=${workspaceId}`,
    data: { workspace_id: workspaceId },
  })

  if (error && error.message !== 'User already registered') {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Upsert workspace_members regardless (user may already exist)
  await adminSupabase.from('workspace_members').upsert({
    workspace_id: workspaceId,
    email: email.toLowerCase(),
    role: 'member',
    status: 'pending',
  }, { onConflict: 'workspace_id,email' })

  return NextResponse.json({ success: true, emailSent: true })
}
