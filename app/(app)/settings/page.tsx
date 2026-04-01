'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace, WORKSPACE_STORAGE_KEY } from '@/lib/workspace-context'
import { Eye } from 'lucide-react'
import { useI18n, type Locale } from '@/lib/i18n'
import { type ConsultantLevel } from '@/lib/types'
import { useTheme } from 'next-themes'
import {
  Plus, Trash2, GripVertical, Settings, Users,
  Mail, Crown, Globe, Sun, Moon, Monitor, Receipt, UserPlus, User, Building2
} from 'lucide-react'

export default function SettingsPage() {
  const supabase = createClient()
  const { workspaceId, workspaceName, members, role, reload, startProxy } = useWorkspace()
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
  const [pendingLevels, setPendingLevels] = useState<Record<string, string>>({})
  const [memberHours, setMemberHours] = useState<Record<string, number>>({})
  const [pendingHours, setPendingHours] = useState<Record<string, number>>({})
  const [savingLevel, setSavingLevel] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [unassignedUsers, setUnassignedUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([])
  const [addingUserId, setAddingUserId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // My profile
  const [myWorkspaces, setMyWorkspaces] = useState<{ workspace_id: string; name: string }[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)

  // Company legal info (EN 16931 / ebInterface)
  const [legalName, setLegalName] = useState('')
  const [addressStreet, setAddressStreet] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressZip, setAddressZip] = useState('')
  const [addressCountry, setAddressCountry] = useState('AT')
  const [vatId, setVatId] = useState('')
  const [companyReg, setCompanyReg] = useState('')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [legalSaved, setLegalSaved] = useState(false)

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

  const loadLegalInfo = useCallback(async () => {
    if (!workspaceId) return
    const { data } = await supabase.from('workspaces').select(
      'legal_name, address_street, address_city, address_zip, address_country, vat_id, company_reg, iban, bic'
    ).eq('id', workspaceId).single()
    if (data) {
      setLegalName(data.legal_name || '')
      setAddressStreet(data.address_street || '')
      setAddressCity(data.address_city || '')
      setAddressZip(data.address_zip || '')
      setAddressCountry(data.address_country || 'AT')
      setVatId(data.vat_id || '')
      setCompanyReg(data.company_reg || '')
      setIban(data.iban || '')
      setBic(data.bic || '')
    }
  }, [supabase, workspaceId])

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
      .select('id, level_id, weekly_hours')
      .eq('workspace_id', workspaceId)
    const levelMap: Record<string, string> = {}
    const hoursMap: Record<string, number> = {}
    for (const m of memberData || []) {
      if (m.level_id) levelMap[m.id] = m.level_id
      hoursMap[m.id] = m.weekly_hours ?? 40
    }
    setMemberLevels(levelMap)
    setMemberHours(hoursMap)
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
    if (role === 'admin') loadLegalInfo()
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
      }
    })
  }, [loadLevels, loadUnassignedUsers, loadLegalInfo, supabase.auth, supabase, role])

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
    await supabase.from('workspace_members').delete().eq('id', id)
    setConfirmDeleteId(null)
    reload()
  }

  async function saveWorkspaceName() {
    await supabase.from('workspaces').update({ name: wsName }).eq('id', workspaceId)
    reload()
  }

  async function saveLegalInfo() {
    await supabase.from('workspaces').update({
      legal_name: legalName || null,
      address_street: addressStreet || null,
      address_city: addressCity || null,
      address_zip: addressZip || null,
      address_country: addressCountry || 'AT',
      vat_id: vatId || null,
      company_reg: companyReg || null,
      iban: iban || null,
      bic: bic || null,
    }).eq('id', workspaceId)
    setLegalSaved(true)
    setTimeout(() => setLegalSaved(false), 2000)
  }

  async function saveMember(memberId: string) {
    const levelId = pendingLevels[memberId] ?? memberLevels[memberId] ?? ''
    const weeklyHours = pendingHours[memberId] ?? memberHours[memberId] ?? 40
    setSavingLevel(memberId)
    const res = await fetch('/api/admin/member-level', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, levelId, weeklyHours, workspaceId }),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error || 'Failed to save')
      setSavingLevel(null)
      return
    }
    setMemberLevels(prev => ({ ...prev, [memberId]: levelId }))
    setMemberHours(prev => ({ ...prev, [memberId]: weeklyHours }))
    setPendingLevels(prev => { const n = { ...prev }; delete n[memberId]; return n })
    setPendingHours(prev => { const n = { ...prev }; delete n[memberId]; return n })
    setSavingLevel(null)
    reload()
  }

  async function saveMyProfile() {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, selectedWorkspaceId)
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
              <h2 className="font-semibold text-foreground text-sm">{t('myProfile')}</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t('selectWorkspaceHint')}</p>
            <div className="space-y-3">
              <div>
                <label className="label">{t('activeWorkspace')}</label>
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
            </div>
            <button onClick={saveMyProfile} className="btn-primary mt-4">
              {profileSaved ? t('savedCheck') : t('save')}
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

        {/* Company legal info — EN 16931 / ebInterface (admin only) */}
        {role === 'admin' && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground text-sm">{t('legalInfoTitle')}</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t('legalInfoHint')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">{t('legalCompanyName')}</label>
                <input className="input" placeholder="Kairos Consulting GmbH" value={legalName} onChange={e => setLegalName(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label">{t('legalStreet')}</label>
                <input className="input" placeholder="Musterstraße 1" value={addressStreet} onChange={e => setAddressStreet(e.target.value)} />
              </div>
              <div>
                <label className="label">{t('legalZip')}</label>
                <input className="input" placeholder="1010" value={addressZip} onChange={e => setAddressZip(e.target.value)} />
              </div>
              <div>
                <label className="label">{t('legalCity')}</label>
                <input className="input" placeholder="Wien" value={addressCity} onChange={e => setAddressCity(e.target.value)} />
              </div>
              <div>
                <label className="label">{t('legalCountry')}</label>
                <select className="input" value={addressCountry} onChange={e => setAddressCountry(e.target.value)}>
                  <option value="AT">AT — Österreich</option>
                  <option value="DE">DE — Deutschland</option>
                  <option value="CH">CH — Schweiz</option>
                  <option value="US">US — United States</option>
                </select>
              </div>
              <div>
                <label className="label">{t('legalVatId')}</label>
                <input className="input" placeholder="ATU12345678" value={vatId} onChange={e => setVatId(e.target.value)} />
              </div>
              <div>
                <label className="label">{t('legalCompanyReg')}</label>
                <input className="input" placeholder="FN 123456 a" value={companyReg} onChange={e => setCompanyReg(e.target.value)} />
              </div>
              <div>
                <label className="label">IBAN</label>
                <input className="input" placeholder="AT12 3456 7890 1234 5678" value={iban} onChange={e => setIban(e.target.value)} />
              </div>
              <div>
                <label className="label">BIC</label>
                <input className="input" placeholder="RLNWATWW" value={bic} onChange={e => setBic(e.target.value)} />
              </div>
            </div>
            <button onClick={saveLegalInfo} className="btn-primary mt-4">
              {legalSaved ? t('savedCheck') : t('save')}
            </button>
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
              {bmdSaved ? t('savedCheck') : t('save')}
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

        {/* Team members — admin only */}
        {role === 'admin' && <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground text-sm">{t('teamMembers')}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t('teamMembersHint')}</p>

          <div className="space-y-2 mb-4">
            {members.map(m => (
              <div key={m.id} className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg group border border-transparent hover:border-border transition-colors">
                {/* Row 1: avatar + name + role badges + action buttons */}
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 dark:text-brand-500 text-xs font-bold flex-shrink-0">
                    {(m.full_name || m.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{m.full_name || m.email}</p>
                    {m.full_name && <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {m.role === 'admin' && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full"><Crown className="w-2.5 h-2.5" />Admin</span>}
                    {m.role === 'partner' && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full"><Crown className="w-2.5 h-2.5" />Partner</span>}
                    {(m.role === 'project_manager' || m.isProjectManager) && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 dark:text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded-full">PM</span>}
                    {m.status === 'pending' && (
                      <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">{t('pending')}</span>
                    )}
                    {m.user_id !== currentUserId && role === 'admin' && m.user_id && (
                      <button
                        onClick={() => {
                          startProxy({ userId: m.user_id!, name: m.full_name || m.email })
                          window.location.href = '/dashboard'
                        }}
                        className="p-1 text-muted-foreground hover:text-brand-600 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                        title="View as this user"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {m.user_id !== currentUserId && role === 'admin' && (
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        className="p-1 text-muted-foreground hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: level + hours controls (admin only) */}
                {role === 'admin' && (() => {
                  const currentLevel = pendingLevels[m.id] ?? memberLevels[m.id] ?? ''
                  const savedLevel = memberLevels[m.id] ?? ''
                  const currentHours = pendingHours[m.id] ?? memberHours[m.id] ?? 40
                  const savedHours = memberHours[m.id] ?? 40
                  const isDirty = (m.id in pendingLevels && pendingLevels[m.id] !== savedLevel)
                    || (m.id in pendingHours && pendingHours[m.id] !== savedHours)
                  return (
                    <div className="flex items-center gap-2 pl-10">
                      {levels.length > 0 && (
                        <select
                          className="input w-36 text-xs py-1 flex-shrink-0"
                          value={currentLevel}
                          onChange={e => setPendingLevels(prev => ({ ...prev, [m.id]: e.target.value }))}
                        >
                          <option value="">{t('noLevel')}</option>
                          {levels.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="number"
                        min={0}
                        max={40}
                        className="input w-14 text-xs py-1 text-center flex-shrink-0"
                        value={currentHours}
                        onChange={e => {
                          const v = Math.min(40, Math.max(0, parseInt(e.target.value) || 0))
                          setPendingHours(prev => ({ ...prev, [m.id]: v }))
                        }}
                        title="Weekly contracted hours"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{t('hoursPerWeek')}</span>
                      {isDirty && (
                        <button
                          onClick={() => saveMember(m.id)}
                          disabled={savingLevel === m.id}
                          className="btn-primary text-xs py-1 px-2.5 ml-auto"
                        >
                          {savingLevel === m.id ? '…' : 'Save'}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>

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
        </div>}

        {/* Consultant levels — admin only */}
        {role === 'admin' && <div className="card p-6">
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
        </div>}

      </div>

      {/* Delete member confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-foreground mb-2">{t('removeMemberTitle')}</h3>
            <p className="text-xs text-muted-foreground mb-5">{t('removeMemberConfirm')}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="btn-secondary text-sm px-4 py-2"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => removeMember(confirmDeleteId)}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {t('remove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
