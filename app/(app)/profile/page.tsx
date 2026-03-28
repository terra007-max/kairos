'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { User, Mail, Lock, Save, Camera } from 'lucide-react'

export default function ProfilePage() {
  const supabase = createClient()
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('full_name, email, avatar_url').eq('id', user.id).single()
      setFullName(profile?.full_name || '')
      setEmail(profile?.email || user.email || '')
      setAvatarUrl(profile?.avatar_url || null)
      setLoading(false)
    }
    load()
  }, [])

  async function handleAvatarUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 2 * 1024 * 1024) { alert('Max 2 MB'); return }
    if (!userId) return
    setUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${userId}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // Bust cache with timestamp
      const url = `${publicUrl}?t=${Date.now()}`
      setAvatarUrl(url)
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
      setProfileMsg({ type: 'success', text: 'Avatar updated' })
    }
    setUploading(false)
  }

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

  const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'

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

          {/* Avatar upload */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="relative w-16 h-16 rounded-full overflow-hidden group focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-brand-600/10 flex items-center justify-center text-brand-600 text-xl font-bold">
                    {initials}
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera className="w-5 h-5 text-white" />}
                </div>
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{fullName || 'No name set'}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs text-brand-600 hover:text-brand-500 mt-0.5 transition-colors"
              >
                {uploading ? 'Uploading…' : 'Change photo'}
              </button>
              <p className="text-xs text-muted-foreground/50 mt-0.5">PNG, JPG · max 2 MB</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />
          </div>

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
