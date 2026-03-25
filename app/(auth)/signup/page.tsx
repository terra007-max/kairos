'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Clock } from 'lucide-react'

export default function SignupPage() {
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    if (error) { setError(error.message); setLoading(false) }
    else { window.location.href = '/dashboard' }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-brand-600 rounded-xl shadow-sm mb-4">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Kairos</h1>
          <p className="text-sm text-gray-400 mt-1">Start tracking in under 2 minutes.</p>
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-5">Create your account</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-3.5">
            <div>
              <label className="label">Full name</label>
              <input type="text" className="input" placeholder="Jane Smith" value={fullName} onChange={e => setFullName(e.target.value)} required autoComplete="name" />
            </div>
            <div>
              <label className="label">Email address</label>
              <input type="email" className="input" placeholder="jane@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" minLength={6} />
            </div>
            <button type="submit" className="btn-primary w-full py-2.5 mt-1" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-400">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}