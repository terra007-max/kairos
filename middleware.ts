import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { can, type WorkspaceRole, ROUTE_RULES } from '@/lib/permissions'

const PROTECTED = [
  '/dashboard', '/timer', '/projects', '/clients', '/reports',
  '/invoices', '/settings', '/profile', '/timesheets', '/analytics', '/impressum',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Build a mutable response so Supabase can refresh session cookies
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

  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isAuthPage  = pathname === '/login' || pathname === '/signup'

  // Redirect unauthenticated users away from protected pages
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect already-authenticated users away from login/signup
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Role-based route enforcement ────────────────────────────────────────
  // The role cookie is written by WorkspaceProvider on load.
  // If absent (first load / cold start) we allow through — the page itself
  // does a client-side guard as a second line of defence.
  const role = request.cookies.get('kairos-role')?.value as WorkspaceRole | undefined

  if (role && user) {
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
    // Run on all routes except static assets and Supabase auth callbacks
    '/((?!_next/static|_next/image|favicon.ico|sw.js|api/auth|invite).*)',
  ],
}
