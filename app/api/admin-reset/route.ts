import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// One-time admin password reset — protected by secret token
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.ADMIN_RESET_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const email = req.nextUrl.searchParams.get('email')
  const newPassword = req.nextUrl.searchParams.get('password')
  if (!email || !newPassword) {
    return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'No service role key configured' }, { status: 500 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Find user by email
  const { data: { users }, error: listError } = await adminSupabase.auth.admin.listUsers()
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Set new password
  const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  })
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, message: `Password updated for ${email}` })
}
