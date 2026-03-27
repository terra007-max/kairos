import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Simple in-process rate limiter: max 5 attempts per IP per 15 minutes
const rateMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 15 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const { email, password, inviteCode } = body || {}

  // Validate invite code server-side (kept out of client bundle)
  const validCode = process.env.INVITE_CODE
  if (!validCode || inviteCode?.trim().toUpperCase() !== validCode.toUpperCase()) {
    return NextResponse.json({ error: 'Invalid invite code.' }, { status: 403 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Create user (email confirmed immediately — no verification email needed)
  const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
  })

  if (createError) {
    const msg = createError.message.includes('already registered')
      ? 'An account with this email already exists.'
      : createError.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const userId = newUser.user.id

  // Auto-join the first workspace (single-tenant setup)
  const { data: workspaces, error: wsError } = await adminSupabase
    .from('workspaces')
    .select('id')
    .limit(1)

  if (wsError || !workspaces?.length) {
    console.error('[signup] workspace lookup failed:', wsError)
    // Clean up the created user so they can retry once workspace is set up
    await adminSupabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'No workspace is configured yet. Please contact the administrator.' }, { status: 500 })
  }

  const workspaceId = workspaces[0].id

  const { error: memberError } = await adminSupabase.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: userId,
    email: email.toLowerCase().trim(),
    role: 'member',
    status: 'active',
  })

  if (memberError) {
    console.error('[signup] workspace_members insert failed:', memberError)
    return NextResponse.json({ success: true, warning: `Account created but workspace join failed: ${memberError.message}` })
  }

  return NextResponse.json({ success: true })
}
