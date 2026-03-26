'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Clock } from 'lucide-react'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // If Supabase recovery email lands here (hash contains type=recovery),
  // forward the user to the dedicated reset-password page (hash preserved).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      window.location.href = '/reset-password' + window.location.hash
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { window.location.href = '/dashboard' }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { setError('Enter your email address first.'); return }
    setLoading(true); setError(null)
    const appUrl = window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message) }
    else { setResetSent(true) }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-brand-600 rounded-xl shadow-sm mb-4">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Kairos</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your time. Maximize your value.</p>
        </div>

        <div className="card p-6">
          {resetSent ? (
            <div className="text-center space-y-3">
              <p className="text-sm font-medium text-foreground">Check your email</p>
              <p className="text-xs text-muted-foreground">We sent a password reset link to <strong>{email}</strong>. Click the link in the email to set a new password.</p>
              <button onClick={() => { setResetSent(false); setForgotMode(false) }} className="btn-secondary w-full mt-2">Back to Login</button>
            </div>
          ) : forgotMode ? (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-1">Reset password</h2>
              <p className="text-xs text-muted-foreground mb-5">Enter your email and we'll send you a reset link.</p>
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500">{error}</div>
              )}
              <form onSubmit={handleForgot} className="space-y-3.5">
                <div>
                  <label className="label">Email address</label>
                  <input type="email" className="input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
                </div>
                <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
              <button onClick={() => { setForgotMode(false); setError(null) }} className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground text-center">
                Back to login
              </button>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-5">Sign in to your account</h2>
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500">{error}</div>
              )}
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="label">Email address</label>
                  <input type="email" className="input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">Password</label>
                    <button type="button" onClick={() => { setForgotMode(true); setError(null) }} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                      Forgot password?
                    </button>
                  </div>
                  <input type="password" className="input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                <button type="submit" className="btn-primary w-full py-2.5 mt-1" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              <p className="mt-5 text-center text-xs text-muted-foreground">
                Access by invitation only.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
