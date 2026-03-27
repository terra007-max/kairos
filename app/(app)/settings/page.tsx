'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace, WORKSPACE_STORAGE_KEY } from '@/lib/workspace-context'
import { useI18n, type Locale } from '@/lib/i18n'
import { type ConsultantLevel } from '@/lib/types'
import { useTheme } from 'next-themes'
import {
  Plus, Trash2, GripVertical, Settings, Users,
  Mail, Crown, Globe, Sun, Moon, Monitor, Receipt, UserPlus, User
} from 'lucide-react'

export default function SettingsPage() {
  const supabase = createClient()
  const { workspaceId, workspaceName, members, role, reload } = useWorkspace()
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()

  const [levels, setLevels] = useState<ConsultantLevel[]>([])
  const [newLevelName, setNewLevelName] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [wsName, setWsName] = useState(workspaceName)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [memberLevels, setMemberLevels] = useState<Record<string, string>>({})
  const [mounted, setMounted] = useState(false)
  const [unassignedUsers, setUnassignedUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([])
  const [addingUserId, setAddingUserId] = useState<string | null>(null)

  // My profile
  const [myWorkspaces, setMyWorkspaces] = useState<{ workspace_id: string; name: string }[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [myLevelId, setMyLevelId] = useState('')
  const [myMemberId, setMyMemberId] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)

  // BMD NTCS settings
  const [taxCode, setTaxCode] = useState('U20')
  const [revenueAccount, setRevenueAccount] = useState('4000')
  const [debitorAccount, setDebitorAccount] = useState('10000')
  const [bmdSaved, setBmdSaved] = useState(false)

  useEffect(() => {
    setMounted(true)
    setTaxCode(localStorage.getItem('kairos-bmd-taxcode') || 'U20')
    setRevenueAccount(localStorage.getItem('kairos-bmd-revenue') || '4000')
    setDebitorAccount(localStorage.getItem('kairos-bmd-debitor') || '10000')
  }, [])

  const loadLevels = useCallback(async () => {
    if (!workspaceId) return
    const { data } = await supabase
      .from('consultant_levels')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('sort_order')
    setLevels(data || [])

    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('id, level_id')
      .eq('workspace_id', workspaceId)
    const map: Record<string, string> = {}
    for (const m of memberData || []) {
      if (m.level_id) map[m.id] = m.level_id
    }
    setMemberLevels(map)
    setLoading(false)
  }, [supabase, workspaceId])

  const loadUnassignedUsers = useCallback(async () => {
    if (role !== 'admin' || !workspaceId) return
    const res = await fetch(`/api/admin/users?workspaceId=${workspaceId}`)
    if (res.ok) {
      const json = await res.json()
      setUnassignedUsers(json.users || [])
    }
  }, [role, workspaceId])

  async function addToWorkspace(u: { id: string; email: string; full_name: string | null }) {
    setAddingUserId(u.id)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, userId: u.id, email: u.email }),
    })
    setAddingUserId(null)
    if (res.ok) {
      setUnassignedUsers(prev => prev.filter(x => x.id !== u.id))
      reload()
    } else {
      const err = await res.json()
      alert(err.error || 'Failed to add user')
    }
  }

  useEffect(() => {
    loadLevels()
    loadUnassignedUsers()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setCurrentUserId(user.id)

      // Load all workspaces this user belongs to
      const { data: wRows } = await supabase
        .from('workspace_members')
        .select('workspace_id, level_id, id, workspace:workspaces(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
      if (wRows?.length) {
        setMyWorkspaces(wRows.map((r: any) => ({ workspace_id: r.workspace_id, name: r.workspace?.name || r.workspace_id })))
        const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY)
        const memberRoleRow = wRows.find((r: any) => r.role === 'member')
        const savedRow = saved ? wRows.find((r: any) => r.workspace_id === saved) : null
        const active = memberRoleRow || savedRow || wRows[0]
        setSelectedWorkspaceId(active.workspace_id)
        setMyLevelId(active.level_id || '')
        setMyMemberId(active.id)
      }
    })
  }, [loadLevels, loadUnassignedUsers, supabase.auth, supabase])

  async function addLevel() {
    if (!newLevelName.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('consultant_levels').insert({
      user_id: user.id,
      workspace_id: workspaceId,
      name: newLevelName.trim(),
      sort_order: levels.length,
    })
    setNewLevelName('')
    setSaving(false)
    loadLevels()
  }

  async function removeLevel(id: string) {
    if (!confirm('Delete this level?')) return
    await supabase.from('consultant_levels').delete().eq('id', id)
    loadLevels()
  }

  async function inviteMember() {
    if (!newMemberEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newMemberEmail.trim().toLowerCase(), workspaceId }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Invite failed')
      }
    } catch {
      // fallback: just add to workspace_members
      await supabase.from('workspace_members').upsert({
        workspace_id: workspaceId,
        email: newMemberEmail.trim().toLowerCase(),
        role: 'member',
        status: 'pending',
      }, { onConflict: 'workspace_id,email' })
    }
    setNewMemberEmail('')
    setInviting(false)
    reload()
  }

  async function removeMember(id: string) {
    if (!confirm('Remove this member?')) return
    await supabase.from('workspace_members').delete().eq('id', id)
    reload()
  }

  async function saveWorkspaceName() {
    await supabase.from('workspaces').update({ name: wsName }).eq('id', workspaceId)
    reload()
  }

  async function assignLevel(memberId: string, levelId: string) {
    setMemberLevels(prev => ({ ...prev, [memberId]: levelId }))
    await supabase.from('workspace_members')
      .update({ level_id: levelId || null })
      .eq('id', memberId)
    reload()
  }

  async function saveMyProfile() {
    // Save workspace preference to localStorage
    localStorage.setItem(WORKSPACE_STORAGE_KEY, selectedWorkspaceId)
    // Save level to DB if we have a member row
    if (myMemberId) {
      await supabase.from('workspace_members')
        .update({ level_id: myLevelId || null })
        .eq('id', myMemberId)
    }
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
    reload()
  }

  function saveBMDSettings() {
    localStorage.setItem('kairos-bmd-taxcode', taxCode)
    localStorage.setItem('kairos-bmd-revenue', revenueAccount)
    localStorage.setItem('kairos-bmd-debitor', debitorAccount)
    setBmdSaved(true)
    setTimeout(() => setBmdSaved(false), 2000)
  }

  if (loading || !mounted) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="mobile-content">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">{t('settingsTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('settingsSubtitle')}</p>
      </div>

      <div className="max-w-xl space-y-6">

        {/* My profile */}
        {myWorkspaces.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground text-sm">My profile</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Select your active workspace and consultant level.</p>
            <div className="space-y-3">
              <div>
                <label className="label">Active workspace</label>
                <select
                  className="input"
                  value={selectedWorkspaceId}
                  onChange={e => setSelectedWorkspaceId(e.target.value)}
                >
                  {myWorkspaces.map(w => (
                    <option key={w.workspace_id} value={w.workspace_id}>{w.name}</option>
                  ))}
                </select>
              </div>
              {levels.length > 0 && (
                <div>
                  <label className="label">My consultant level</label>
                  <select
                    className="input"
                    value={myLevelId}
                    onChange={e => setMyLevelId(e.target.value)}
                  >
                    <option value="">No level</option>
                    {levels.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button onClick={saveMyProfile} className="btn-primary mt-4">
              {profileSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        )}

        {/* Appearance */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Sun className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground text-sm">{t('appearance')}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t('appearanceHint')}</p>
          <div className="grid grid-cols-3 gap-2 p-1 bg-muted/50 rounded-xl">
            {[
              { id: 'light', labelKey: 'light' as const, icon: Sun },
              { id: 'dark',  labelKey: 'dark'  as const, icon: Moon },
              { id: 'system',labelKey: 'system' as const, icon: Monitor }
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  theme === opt.id
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <opt.icon size={14} />
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground text-sm">{t('language')}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t('languageHint')}</p>
          <div className="flex gap-2">
            {([['en', 'EN', 'English'], ['de', 'DE', 'Deutsch']] as [Locale, string, string][]).map(([l, code, name]) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                  locale === l
                    ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:border-brand-500/50 hover:text-brand-600'
                }`}
              >
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${locale === l ? 'bg-white/20 text-white' : 'bg-muted text-foreground'}`}>{code}</span>
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Workspace name — admin only */}
        {role === 'admin' && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground text-sm">{t('workspace')}</h2>
            </div>
            <div className="flex gap-2">
              <input className="input flex-1" value={wsName} onChange={e => setWsName(e.target.value)} />
              <button onClick={saveWorkspaceName} className="btn-primary">{t('save')}</button>
            </div>
          </div>
        )}

        {/* BMD NTCS Settings (admin only) */}
        {role === 'admin' && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground text-sm">{t('invoicingSettings')}</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t('invoicingSettingsHint')}</p>
            <div className="space-y-3">
              <div>
                <label className="label">{t('taxCodeLabel')}</label>
                <select className="input" value={taxCode} onChange={e => setTaxCode(e.target.value)}>
                  <option value="U20">U20 — 20% USt (Inland)</option>
                  <option value="U10">U10 — 10% USt (ermäßigt)</option>
                  <option value="IG">IG — Innergemeinschaftliche Lieferung (EU)</option>
                  <option value="AU">AU — Ausfuhrlieferung (Export)</option>
                  <option value="0">0 — Steuerfrei</option>
                </select>
              </div>
              <div>
                <label className="label">{t('revenueAccountLabel')}</label>
                <input className="input" value={revenueAccount} onChange={e => setRevenueAccount(e.target.value)} placeholder="4000" />
              </div>
              <div>
                <label className="label">{t('debitorAccountLabel')}</label>
                <input className="input" value={debitorAccount} onChange={e => setDebitorAccount(e.target.value)} placeholder="10000" />
              </div>
            </div>
            <button onClick={saveBMDSettings} className="btn-primary mt-4">
              {bmdSaved ? '✓ Saved' : t('save')}
            </button>
          </div>
        )}

        {/* Unassigned users — admin only */}
        {role === 'admin' && unassignedUsers.length > 0 && (
          <div className="card p-6 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="w-4 h-4 text-amber-500" />
              <h2 className="font-semibold text-foreground text-sm">Users not in this workspace</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">These accounts exist but are not assigned to your workspace yet.</p>
            <div className="space-y-2">
              {unassignedUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-transparent">
                  <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">
                    {(u.full_name || u.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{u.full_name || u.email}</p>
                    {u.full_name && <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>}
                  </div>
                  <button
                    onClick={() => addToWorkspace(u)}
                    disabled={addingUserId === u.id}
                    className="btn-primary text-xs py-1 px-3 flex-shrink-0"
                  >
                    {addingUserId === u.id ? 'Adding…' : 'Add to workspace'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team members */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground text-sm">{t('teamMembers')}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t('teamMembersHint')}</p>

          <div className="space-y-2 mb-4">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg group border border-transparent hover:border-border transition-colors">
                <div className="w-7 h-7 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 dark:text-brand-500 text-xs font-bold flex-shrink-0">
                  {(m.full_name || m.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{m.full_name || m.email}</p>
                  {m.full_name && <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>}
                </div>

                {role === 'admin' && levels.length > 0 && (
                  <select
                    className="input w-36 text-xs py-1 flex-shrink-0"
                    value={memberLevels[m.id] || ''}
                    onChange={e => assignLevel(m.id, e.target.value)}
                  >
                    <option value="">{t('noLevel')}</option>
                    {levels.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {m.role === 'admin' && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                  {m.status === 'pending' && (
                    <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">{t('pending')}</span>
                  )}
                  {m.user_id !== currentUserId && role === 'admin' && (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {role === 'admin' && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="input pl-9"
                  type="email"
                  placeholder="colleague@company.com"
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && inviteMember()}
                />
              </div>
              <button
                onClick={inviteMember}
                disabled={inviting || !newMemberEmail.trim()}
                className="btn-primary flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> {inviting ? t('inviting') : t('invite')}
              </button>
            </div>
          )}
        </div>

        {/* Consultant levels */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground text-sm">{t('consultantLevels')}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t('consultantLevelsHint')}</p>

          {levels.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-4 italic">{t('noLevelsYet')}</p>
          ) : (
            <div className="space-y-2 mb-4">
              {levels.map((level, i) => (
                <div key={level.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg group border border-transparent hover:border-border transition-colors">
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground flex-1">{level.name}</span>
                  <span className="text-xs text-muted-foreground">Level {i + 1}</span>
                  <button
                    onClick={() => removeLevel(level.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {role === 'admin' && (
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder={t('levelPlaceholder')}
                value={newLevelName}
                onChange={e => setNewLevelName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addLevel()}
              />
              <button
                onClick={addLevel}
                disabled={saving || !newLevelName.trim()}
                className="btn-primary flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> {t('add')}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
