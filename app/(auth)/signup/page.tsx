'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Clock } from 'lucide-react'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)

    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, inviteCode, fullName }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error || 'Something went wrong.')
    } else if (json.warning) {
      setError(`Account created, but workspace join failed: ${json.warning}`)
    } else {
      setDone(true)
    }
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
          {done ? (
            <div className="text-center space-y-3">
              <p className="text-sm font-medium text-foreground">Account created!</p>
              <p className="text-xs text-muted-foreground">Your account is ready. You can now sign in.</p>
              <Link href="/login" className="btn-primary w-full py-2.5 mt-2 block text-center">
                Go to Login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-5">Create your account</h2>
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500">{error}</div>
              )}
              <form onSubmit={handleSignup} className="space-y-3.5">
                <div>
                  <label className="label">Full name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Jane Doe"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    autoFocus
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="label">Invite code</label>
                  <input
                    type="text"
                    className="input font-mono tracking-widest uppercase"
                    placeholder="XXXXXX"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value.toUpperCase())}
                    required
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="label">Email address</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <button type="submit" className="btn-primary w-full py-2.5 mt-1" disabled={loading}>
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>
              <p className="mt-5 text-center text-xs text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-brand-600 hover:text-brand-700 font-medium">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
