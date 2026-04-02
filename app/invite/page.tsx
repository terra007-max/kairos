'use client'

import { useEffect, useState, Suspense } from 'react'
import KairosLoader from '@/components/KairosLoader'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

function InviteForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get('workspace')

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    async function init() {
      // Sign out any existing session first — this ensures we don't accidentally
      // update the wrong user's password if an admin opens the link while logged in.
      await supabase.auth.signOut()

      // Give Supabase JS a moment to process the hash tokens (#access_token=...&type=invite)
      await new Promise(r => setTimeout(r, 800))

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSessionReady(true)
      } else {
        setError('This invite link is invalid or has already been used.')
      }
      setLoading(false)
    }
    init()
  }, [])

  async function activate() {
    if (!fullName.trim()) { setError('Please enter your full name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setSaving(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Save display name to profile
      await supabase.from('profiles').upsert({ id: user.id, full_name: fullName.trim(), email: user.email })

      // Link the user to the workspace — validate the invite exists first
      // to prevent workspace_id substitution attacks in the invite link
      if (workspaceId) {
        const { data: invite } = await supabase
          .from('workspace_members')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('email', user.email?.toLowerCase() ?? '')
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

    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <KairosLoader />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">K</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Kairos</h1>
          <p className="text-sm text-muted-foreground mt-2">Enter your name and set a password to finish creating your account</p>
        </div>

        {!sessionReady ? (
          <div className="card p-6 text-center space-y-4">
            <p className="text-sm text-red-500">{error}</p>
            <a href="/login" className="btn-primary w-full block text-center">Go to Login</a>
          </div>
        ) : (
          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Your full name</label>
              <input
                type="text"
                className="input"
                placeholder="Jane Doe"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                autoFocus
                autoComplete="name"
              />
            </div>
            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                className="input"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input
                type="password"
                className="input"
                placeholder="Repeat password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && activate()}
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={activate}
              disabled={saving || !password || !confirm}
              className="btn-primary w-full"
            >
              {saving ? 'Setting up account…' : 'Set Password & Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <KairosLoader />
      </div>
    }>
      <InviteForm />
    </Suspense>
  )
}
