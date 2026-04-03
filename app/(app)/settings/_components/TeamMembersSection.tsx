'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { type ConsultantLevel } from '@/lib/types'
import { Users, Mail, Crown, Eye, Trash2, Plus } from 'lucide-react'

export function TeamMembersSection({ levels }: { levels: ConsultantLevel[] }) {
  const { t } = useI18n()
  const supabase = createClient()
  const { workspaceId, members, reload, startProxy } = useWorkspace()

  const [currentUserId, setCurrentUserId] = useState('')
  const [memberLevels, setMemberLevels] = useState<Record<string, string>>({})
  const [pendingLevels, setPendingLevels] = useState<Record<string, string>>({})
  const [memberHours, setMemberHours] = useState<Record<string, number>>({})
  const [pendingHours, setPendingHours] = useState<Record<string, number>>({})
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)

    const { data } = await supabase
      .from('workspace_members')
      .select('id, level_id, weekly_hours')
      .eq('workspace_id', workspaceId)
    const levelMap: Record<string, string> = {}
    const hoursMap: Record<string, number> = {}
    for (const m of data || []) {
      if (m.level_id) levelMap[m.id] = m.level_id
      hoursMap[m.id] = m.weekly_hours ?? 40
    }
    setMemberLevels(levelMap)
    setMemberHours(hoursMap)
  }, [supabase, workspaceId])

  useEffect(() => { load() }, [load])

  async function saveMember(memberId: string) {
    const levelId = pendingLevels[memberId] ?? memberLevels[memberId] ?? ''
    const weeklyHours = pendingHours[memberId] ?? memberHours[memberId] ?? 40
    const newRole = pendingRoles[memberId]
    setSavingId(memberId)
    const res = await fetch('/api/admin/member-level', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, levelId, weeklyHours, workspaceId, role: newRole }),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error || 'Failed to save')
      setSavingId(null)
      return
    }
    setMemberLevels(prev => ({ ...prev, [memberId]: levelId }))
    setMemberHours(prev => ({ ...prev, [memberId]: weeklyHours }))
    setPendingLevels(prev => { const n = { ...prev }; delete n[memberId]; return n })
    setPendingHours(prev => { const n = { ...prev }; delete n[memberId]; return n })
    setPendingRoles(prev => { const n = { ...prev }; delete n[memberId]; return n })
    setSavingId(null)
    reload()
  }

  async function inviteMember() {
    if (!newEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), workspaceId }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Invite failed')
      }
    } catch {
      await supabase.from('workspace_members').upsert({
        workspace_id: workspaceId,
        email: newEmail.trim().toLowerCase(),
        role: 'member',
        status: 'pending',
      }, { onConflict: 'workspace_id,email' })
    }
    setNewEmail('')
    setInviting(false)
    reload()
  }

  async function removeMember(id: string) {
    const { error } = await supabase.from('workspace_members').delete().eq('id', id).eq('workspace_id', workspaceId)
    if (error) { alert(error.message); return }
    setConfirmDeleteId(null)
    reload()
  }

  return (
    <>
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground text-sm">{t('teamMembers')}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t('teamMembersHint')}</p>

        <div className="space-y-2 mb-4">
          {members.map(m => {
            const currentLevel = pendingLevels[m.id] ?? memberLevels[m.id] ?? ''
            const savedLevel   = memberLevels[m.id] ?? ''
            const currentHours = pendingHours[m.id] ?? memberHours[m.id] ?? 40
            const savedHours   = memberHours[m.id] ?? 40
            const currentRole  = pendingRoles[m.id] ?? m.role
            const isDirty = (m.id in pendingLevels && pendingLevels[m.id] !== savedLevel)
              || (m.id in pendingHours && pendingHours[m.id] !== savedHours)
              || (m.id in pendingRoles && pendingRoles[m.id] !== m.role)

            return (
              <div key={m.id} className="flex flex-col gap-2.5 p-4 bg-muted/30 rounded-xl border border-transparent hover:border-border transition-colors">

                {/* Row 1: avatar + name + icon actions */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 dark:text-brand-500 text-xs font-bold shrink-0">
                    {(m.full_name || m.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate leading-tight">{m.full_name || m.email}</p>
                    {m.full_name && <p className="text-xs text-muted-foreground truncate leading-tight">{m.email}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.role === 'partner' && <Crown className="w-3.5 h-3.5 text-amber-500 mr-1" />}
                    {m.status === 'pending' && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full mr-1">{t('pending')}</span>
                    )}
                    {m.user_id !== currentUserId && m.user_id && (
                      <button
                        onClick={() => { startProxy({ userId: m.user_id!, name: m.full_name || m.email }); window.location.href = '/dashboard' }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-600 hover:bg-brand-600/10 transition-all"
                        title="View as this user"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {m.user_id !== currentUserId && (
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: level + weekly hours */}
                <div className="flex items-center gap-2">
                  {levels.length > 0 && (
                    <select
                      className="flex-1 min-w-0 bg-card border border-border rounded-lg text-xs px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                      value={currentLevel}
                      onChange={e => setPendingLevels(prev => ({ ...prev, [m.id]: e.target.value }))}
                    >
                      <option value="">{t('noLevel')}</option>
                      {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                  <div className="flex items-center gap-1 border border-border rounded-lg bg-card px-2.5 py-1.5 shrink-0">
                    <input
                      type="number" min={0} max={60}
                      className="w-8 bg-transparent text-xs text-center text-foreground focus:outline-none"
                      value={currentHours}
                      onChange={e => setPendingHours(prev => ({ ...prev, [m.id]: Math.min(60, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      title="Weekly contracted hours"
                    />
                    <span className="text-[10px] text-muted-foreground">h/w</span>
                  </div>
                </div>

                {/* Row 3: role selector + save */}
                {m.role !== 'admin' && (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 rounded-lg border border-border overflow-hidden">
                      {(['member', 'project_manager', 'partner'] as const).map(r => (
                        <button
                          key={r}
                          onClick={() => setPendingRoles(prev => ({ ...prev, [m.id]: r }))}
                          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                            currentRole === r
                              ? 'bg-brand-600 text-white'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                          }`}
                        >
                          {r === 'member' ? 'Member' : r === 'project_manager' ? 'PM' : 'Partner'}
                        </button>
                      ))}
                    </div>
                    {isDirty && (
                      <button
                        onClick={() => saveMember(m.id)}
                        disabled={savingId === m.id}
                        className="btn-primary text-xs py-1.5 px-3 shrink-0"
                      >
                        {savingId === m.id ? '…' : 'Save'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="input pl-9" type="email"
              placeholder="colleague@company.com"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && inviteMember()}
            />
          </div>
          <button onClick={inviteMember} disabled={inviting || !newEmail.trim()} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> {inviting ? t('inviting') : t('invite')}
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-foreground mb-2">{t('removeMemberTitle')}</h3>
            <p className="text-xs text-muted-foreground mb-5">{t('removeMemberConfirm')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteId(null)} className="btn-secondary text-sm px-4 py-2">{t('cancel')}</button>
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
    </>
  )
}
