'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { User, Mail, Lock, Save } from 'lucide-react'

export default function ProfilePage() {
  const supabase = createClient()
  const { t } = useI18n()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()
      setFullName(profile?.full_name || ''); setEmail(profile?.email || user.email || ''); setLoading(false)
    }
    load()
  }, [])

  async function saveProfile() {
    setSavingProfile(true); setProfileMsg(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
    setProfileMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: t('profileUpdated') })
    setSavingProfile(false)
  }

  async function savePassword() {
    if (newPassword !== confirmPassword) { setPasswordMsg({ type: 'error', text: t('passwordMismatch') }); return }
    if (newPassword.length < 6) { setPasswordMsg({ type: 'error', text: t('passwordTooShort') }); return }
    setSavingPassword(true); setPasswordMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: t('passwordUpdated') })
    if (!error) { setNewPassword(''); setConfirmPassword('') }
    setSavingPassword(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">{t('profileTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('profileSubtitle')}</p>
      </div>

      <div className="max-w-lg space-y-5">
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5"><User className="w-4 h-4 text-muted-foreground" /><h2 className="font-semibold text-foreground text-sm">{t('personalInfo')}</h2></div>
          {profileMsg && <div className={`mb-4 p-3 rounded-lg text-xs ${profileMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>{profileMsg.text}</div>}
          <div className="space-y-4">
            <div><label className="label">{t('fullName')}</label><input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('fullName')} /></div>
            <div>
              <label className="label">{t('emailAddress')}</label>
              <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" /><input className="input pl-9 opacity-50 cursor-not-allowed" value={email} disabled /></div>
              <p className="text-xs text-muted-foreground/50 mt-1">{t('emailCannotChange')}</p>
            </div>
          </div>
          <button onClick={saveProfile} disabled={savingProfile || !fullName.trim()} className="btn-primary mt-5 flex items-center gap-2">
            <Save className="w-3.5 h-3.5" />{savingProfile ? t('saving') : t('saveChanges')}
          </button>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5"><Lock className="w-4 h-4 text-muted-foreground" /><h2 className="font-semibold text-foreground text-sm">{t('changePassword')}</h2></div>
          {passwordMsg && <div className={`mb-4 p-3 rounded-lg text-xs ${passwordMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>{passwordMsg.text}</div>}
          <div className="space-y-4">
            <div><label className="label">{t('newPassword')}</label><input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6" autoComplete="new-password" /></div>
            <div><label className="label">{t('confirmPassword')}</label><input type="password" className="input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('confirmPassword')} autoComplete="new-password" /></div>
          </div>
          <button onClick={savePassword} disabled={savingPassword || !newPassword || !confirmPassword} className="btn-primary mt-5 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" />{savingPassword ? t('updating') : t('updatePassword')}
          </button>
        </div>
      </div>
    </div>
  )
}
