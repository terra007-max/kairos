import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { can, type WorkspaceRole, ROUTE_RULES } from '@/lib/permissions'

const PROTECTED = [
  '/dashboard', '/timer', '/projects', '/clients',
  '/invoices', '/settings', '/profile', '/timesheets', '/analytics', '/absence', '/impressum',
]

// Routes that require a permission check beyond "just authenticated"
const ROLE_GATED = ROUTE_RULES.map(r => r.path)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: Record<string, unknown>) {
          request.cookies.set({ name, value })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: Record<string, unknown>) {
          request.cookies.set({ name, value: '' })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // ── Authentication ────────────────────────────────────────────────────────
  // getUser() validates the JWT server-side — cannot be forged by the client.
  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isAuthPage  = pathname === '/login' || pathname === '/signup'

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Role-based route enforcement ──────────────────────────────────────────
  // Only run the DB lookup for routes that actually need a permission check.
  // The role comes from the database (RLS-protected) — not from a cookie —
  // so it cannot be forged by the client.
  const needsRoleCheck = user && ROLE_GATED.some(p => pathname.startsWith(p))

  if (needsRoleCheck) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    const role = member?.role as WorkspaceRole | undefined

    for (const { path, permission } of ROUTE_RULES) {
      if (pathname.startsWith(path) && !can(role, permission)) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|api/auth|invite).*)',
  ],
}
