import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
        get(name) { return request.cookies.get(name)?.value },
        set(name, value, options) {
          request.cookies.set({ name, value })
          response.cookies.set({ name, value, ...options })
        },
        remove(name, options) {
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

  return response
}

export const config = {
  matcher: [
    // Run on all routes except static assets and Supabase auth callbacks
    '/((?!_next/static|_next/image|favicon.ico|sw.js|api/auth|invite).*)',
  ],
}
