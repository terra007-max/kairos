import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const workspaceId = requestUrl.searchParams.get('workspace')

  if (code) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

    // If user accepted a workspace invite, link them
    if (session?.user && workspaceId) {
      const user = session.user
      // Update workspace_members: set user_id and activate
      await supabase
        .from('workspace_members')
        .update({ user_id: user.id, status: 'active' })
        .eq('workspace_id', workspaceId)
        .eq('email', user.email?.toLowerCase() ?? '')
        .eq('status', 'pending')
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
