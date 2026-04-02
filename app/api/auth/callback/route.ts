import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const workspaceId = requestUrl.searchParams.get('workspace')

  if (code) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

    // If user accepted a workspace invite, link them.
    // We validate that a pending invite for this exact (workspace_id, email) pair
    // actually exists before activating — prevents URL-tampering attacks where an
    // attacker substitutes a different workspace_id in the invite link.
    if (session?.user && workspaceId) {
      const user = session.user
      const email = user.email?.toLowerCase() ?? ''

      // Only activate if a genuine pending invite exists for this workspace + email
      const { data: invite } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('email', email)
        .eq('status', 'pending')
        .single()

      if (invite) {
        await supabase
          .from('workspace_members')
          .update({ user_id: user.id, status: 'active' })
          .eq('id', invite.id)
      }
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
