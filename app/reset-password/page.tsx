'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Clock } from 'lucide-react'

function ResetForm() {
  const supabase = createClient()
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Listen for Supabase PASSWORD_RECOVERY event — fired when the hash token is processed
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setSessionReady(true)
        setLoading(false)
      }
    })

    // Also check if session is already set (page reload case)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
        setLoading(false)
      }
    })

    // Timeout — if nothing happens in 5s, token is invalid/expired
    const timer = setTimeout(() => {
      setLoading(prev => {
        if (prev) setError('This link is invalid or has already been used.')
        return false
      })
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function submit() {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setSaving(false); return }
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">Verifying reset link…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/icon.svg" alt="Kairos" className="w-14 h-14 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground">Reset your password</h1>
          <p className="text-sm text-muted-foreground mt-1">Choose a new password for your account</p>
        </div>

        <div className="card p-6">
          {!sessionReady ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-red-500">{error}</p>
              <p className="text-xs text-muted-foreground">Please request a new reset link from the login page.</p>
              <a href="/login" className="btn-secondary w-full block text-center">Back to Login</a>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div>
                <label className="label">New Password</label>
                <input type="password" className="input" placeholder="Minimum 8 characters" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input type="password" className="input" placeholder="Repeat password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button onClick={submit} disabled={saving || !password || !confirm} className="btn-primary w-full py-2.5 mt-1">
                {saving ? 'Saving…' : 'Set New Password'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetForm />
    </Suspense>
  )
}
