'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { type Project, type Client, type ConsultantLevel, type ProjectLevelRate, formatMoney, formatDuration } from '@/lib/types'
import { FolderOpen, Plus, Pencil, Archive, ArchiveRestore, Trash2, CalendarDays, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'

const COLORS = ['#f97316','#6366f1','#10b981','#ef4444','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#14b8a6']
type ProjectRow = Project & { client?: Client; totalSecs?: number; earnings?: number; level_rates?: ProjectLevelRate[]; memberIds?: string[] }

export default function ProjectsPage() {
  const supabase = createClient()
  const { workspaceId, role, members } = useWorkspace()
  const { t } = useI18n()
  const isAdmin = role === 'admin'

  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [levels, setLevels] = useState<ConsultantLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [editProject, setEditProject] = useState<ProjectRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState<'active' | 'archived'>('active')

  const load = useCallback(async () => {
    if (!workspaceId) return
    const [{ data: proj }, { data: cl }, { data: entries }, { data: lvls }, { data: rates }, { data: pm }] = await Promise.all([
      supabase.from('projects').select('*, client:clients(*)').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('workspace_id', workspaceId).order('name'),
      supabase.from('time_entries').select('project_id, duration_sec, level_id').eq('workspace_id', workspaceId).not('end_time', 'is', null),
      supabase.from('consultant_levels').select('*').eq('workspace_id', workspaceId).order('sort_order'),
      supabase.from('project_level_rates').select('*, level:consultant_levels(*)'),
      supabase.from('project_members').select('project_id, user_id').eq('workspace_id', workspaceId),
    ])
    const entryMap: Record<string, number> = {}
    const levelEntryMap: Record<string, Record<string, number>> = {}
    for (const e of entries || []) {
      if (!e.project_id) continue
      entryMap[e.project_id] = (entryMap[e.project_id] || 0) + (e.duration_sec || 0)
      if (e.level_id) {
        if (!levelEntryMap[e.project_id]) levelEntryMap[e.project_id] = {}
        levelEntryMap[e.project_id][e.level_id] = (levelEntryMap[e.project_id][e.level_id] || 0) + (e.duration_sec || 0)
      }
    }
    const ratesMap: Record<string, ProjectLevelRate[]> = {}
    for (const r of rates || []) { if (!ratesMap[r.project_id]) ratesMap[r.project_id] = []; ratesMap[r.project_id].push(r as ProjectLevelRate) }
    const membersMap: Record<string, string[]> = {}
    for (const m of pm || []) { if (!membersMap[m.project_id]) membersMap[m.project_id] = []; membersMap[m.project_id].push(m.user_id) }
    const rows = (proj || []).map(p => {
      const levelSecs = levelEntryMap[p.id] || {}
      const earnings = (ratesMap[p.id] || []).reduce((sum, lr) => sum + ((levelSecs[lr.level_id] || 0) / 3600) * lr.hourly_rate, 0)
      return { ...p, totalSecs: entryMap[p.id] || 0, earnings, level_rates: ratesMap[p.id] || [], memberIds: membersMap[p.id] || [] }
    }) as ProjectRow[]
    setProjects(rows); setClients(cl || []); setLevels(lvls || []); setLoading(false)
  }, [supabase, workspaceId])

  useEffect(() => { load() }, [load])

  async function archive(p: ProjectRow) {
    if (!isAdmin) return
    await supabase.from('projects').update({ status: p.status === 'active' ? 'archived' : 'active' }).eq('id', p.id)
    load()
  }

  async function remove(id: string) {
    if (!isAdmin) return
    if (!confirm('Delete this project?')) return
    await supabase.from('projects').delete().eq('id', id)
    load()
  }

  const filtered = projects.filter(p => p.status === tab)

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('projectsTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{isAdmin ? t('manageProjects') : t('viewProjects')}</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditProject(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t('newProject')}
          </button>
        )}
      </div>

      {isAdmin && (showForm || editProject) && (
        <ProjectForm project={editProject} clients={clients} levels={levels} workspaceId={workspaceId} members={members}
          onSave={() => { setShowForm(false); setEditProject(null); load() }}
          onCancel={() => { setShowForm(false); setEditProject(null) }} />
      )}

      <div className="flex gap-0.5 mb-6 bg-muted p-0.5 rounded-lg w-fit">
        {(['active', 'archived'] as const).map(tabVal => (
          <button key={tabVal} onClick={() => setTab(tabVal)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === tabVal ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {tabVal === 'active' ? t('active') : t('archived')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{tab === 'active' ? t('noActiveProjects') : t('noArchivedProjects')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map(p => {
            const trackedHours = (p.totalSecs || 0) / 3600
            const budgetHoursPct = p.budget_hours ? Math.min(trackedHours / p.budget_hours * 100, 100) : null
            const budgetAmountPct = p.budget_amount && p.earnings ? Math.min(p.earnings / p.budget_amount * 100, 100) : null
            return (
              <div key={p.id} className="card p-5 group hover:shadow-card-hover transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: p.color }} />
                    <div>
                      <Link href={`/projects/${p.id}`} className="font-semibold text-foreground hover:text-brand-600 transition-colors text-sm">{p.name}</Link>
                      {p.client && <p className="text-xs text-muted-foreground mt-0.5">{(p.client as Client).name}</p>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditProject(p); setShowForm(false) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => archive(p)} className="p-1.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground">{p.status === 'active' ? <Archive className="w-3.5 h-3.5" /> : <ArchiveRestore className="w-3.5 h-3.5" />}</button>
                      <button onClick={() => remove(p.id)} className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>

                {(p.start_date || p.end_date) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {p.start_date && format(parseISO(p.start_date), 'MMM d, yyyy')}
                    {p.start_date && p.end_date && ' → '}
                    {p.end_date && format(parseISO(p.end_date), 'MMM d, yyyy')}
                  </div>
                )}

                {p.level_rates && p.level_rates.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {p.level_rates.map(lr => (
                      <span key={lr.id} className="text-xs bg-brand-600/10 text-brand-600 px-2 py-0.5 rounded-full font-medium">
                        {(lr.level as ConsultantLevel)?.name}: {formatMoney(lr.hourly_rate)}/h
                      </span>
                    ))}
                  </div>
                )}

                {p.memberIds && p.memberIds.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    <Users className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                    {p.memberIds.map(uid => {
                      const m = members.find(x => x.user_id === uid)
                      const name = m?.full_name || m?.email || uid
                      return (
                        <span key={uid} className="text-xs bg-brand-600/10 text-brand-600 px-2 py-0.5 rounded-full font-medium">{name}</span>
                      )
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
                  <div><p className="text-xs text-muted-foreground">{t('tracked')}</p><p className="text-xs font-mono font-semibold text-foreground mt-0.5">{formatDuration(p.totalSecs || 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t('earnings')}</p><p className="text-xs font-medium text-emerald-600 mt-0.5">{p.earnings ? formatMoney(p.earnings) : '—'}</p></div>
                </div>

                {budgetHoursPct !== null && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex justify-between text-xs mb-1">
                      <span className={budgetHoursPct >= 100 ? 'text-red-500 font-semibold' : budgetHoursPct >= 80 ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}>
                        {budgetHoursPct >= 100 ? t('hoursExceeded') : budgetHoursPct >= 80 ? t('nearLimit') : t('hoursBudget')}
                      </span>
                      <span className="text-muted-foreground">{trackedHours.toFixed(1)}h / {p.budget_hours}h</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${budgetHoursPct >= 100 ? 'bg-red-500' : budgetHoursPct >= 80 ? 'bg-amber-400' : 'bg-brand-500'}`} style={{ width: `${budgetHoursPct}%` }} />
                    </div>
                  </div>
                )}

                {budgetAmountPct !== null && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className={budgetAmountPct >= 100 ? 'text-red-500 font-semibold' : budgetAmountPct >= 80 ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}>
                        {budgetAmountPct >= 100 ? t('amountExceeded') : budgetAmountPct >= 80 ? t('nearLimit') : t('amountBudget')}
                      </span>
                      <span className="text-muted-foreground">{formatMoney(p.earnings || 0)} / {formatMoney(p.budget_amount || 0)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${budgetAmountPct >= 100 ? 'bg-red-500' : budgetAmountPct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${budgetAmountPct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProjectForm({ project, clients, levels, workspaceId, members, onSave, onCancel }: {
  project: ProjectRow | null; clients: Client[]; levels: ConsultantLevel[]; workspaceId: string; members: any[]; onSave: () => void; onCancel: () => void
}) {
  const supabase = createClient()
  const { t } = useI18n()
  const [name, setName] = useState(project?.name || '')
  const [clientId, setClientId] = useState(project?.client_id || '')
  const [color, setColor] = useState(project?.color || COLORS[0])
  const [notes, setNotes] = useState(project?.notes || '')
  const [startDate, setStartDate] = useState(project?.start_date || '')
  const [endDate, setEndDate] = useState(project?.end_date || '')
  const [rounding, setRounding] = useState(String(project?.rounding_minutes || '0'))
  const [budgetHours, setBudgetHours] = useState(String(project?.budget_hours || ''))
  const [budgetAmount, setBudgetAmount] = useState(String(project?.budget_amount || ''))
  const [levelRates, setLevelRates] = useState<Record<string, string>>(
    Object.fromEntries((project?.level_rates || []).map(lr => [lr.level_id, String(
      lr.rate_type === 'daily' ? lr.hourly_rate * 8 : lr.hourly_rate
    )]))
  )
  const [levelRateTypes, setLevelRateTypes] = useState<Record<string, 'hourly' | 'daily'>>(
    Object.fromEntries((project?.level_rates || []).map(lr => [lr.level_id, lr.rate_type || 'hourly']))
  )
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set(project?.memberIds || [])
  )
  const [saving, setSaving] = useState(false)

  const activeMembers = members.filter(m => m.status === 'active')

  function toggleMember(userId: string) {
    setSelectedMembers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      name: name.trim(), client_id: clientId || null, color,
      notes: notes || null,
      start_date: startDate || null, end_date: endDate || null,
      rounding_minutes: parseInt(rounding) || 0,
      budget_hours: parseFloat(budgetHours) || null,
      budget_amount: parseFloat(budgetAmount) || null,
    }
    let projectId = project?.id
    if (project) {
      await supabase.from('projects').update(payload).eq('id', project.id)
    } else {
      const { data } = await supabase.from('projects').insert({ ...payload, user_id: user.id, workspace_id: workspaceId }).select('id').single()
      projectId = data?.id
    }
    // Sync project members
    if (projectId) {
      await supabase.from('project_members').delete().eq('project_id', projectId)
      if (selectedMembers.size > 0) {
        await supabase.from('project_members').insert(
          Array.from(selectedMembers).map(uid => ({ project_id: projectId, user_id: uid, workspace_id: workspaceId }))
        )
      }
    }
    if (projectId && levels.length > 0) {
      for (const level of levels) {
        const inputVal = parseFloat(levelRates[level.id] || '')
        if (!isNaN(inputVal) && levelRates[level.id] !== '') {
          const rateType = levelRateTypes[level.id] || 'hourly'
          // Always store as hourly_rate; daily = input / 8
          const hourlyEquiv = rateType === 'daily' ? inputVal / 8 : inputVal
          await supabase.from('project_level_rates').upsert(
            { project_id: projectId, level_id: level.id, hourly_rate: hourlyEquiv, rate_type: rateType },
            { onConflict: 'project_id,level_id' }
          )
        } else {
          await supabase.from('project_level_rates').delete().eq('project_id', projectId).eq('level_id', level.id)
        }
      }
    }
    setSaving(false); onSave()
  }

  return (
    <div className="card p-6 mb-6">
      <h2 className="font-semibold text-foreground mb-5 text-sm">{project ? t('editProject') : t('newProject')}</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="col-span-2 md:col-span-1"><label className="label">{t('projectName')}</label><input className="input" placeholder="e.g. Website Redesign" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div>
          <label className="label">{t('client')}</label>
          <select className="input" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">{t('noClient')}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="label">{t('startDate')}</label><input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
        <div><label className="label">{t('endDate')}</label><input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
        <div>
          <label className="label">{t('timeRounding')}</label>
          <select className="input" value={rounding} onChange={e => setRounding(e.target.value)}>
            <option value="0">{t('noRounding')}</option>
            <option value="5">Round up to 5 min</option>
            <option value="10">Round up to 10 min</option>
            <option value="15">Round up to 15 min</option>
            <option value="30">Round up to 30 min</option>
            <option value="60">Round up to 1 hour</option>
          </select>
        </div>
        <div><label className="label">{t('budgetHours')}</label><input type="number" className="input" placeholder="e.g. 40" value={budgetHours} onChange={e => setBudgetHours(e.target.value)} min="0" /></div>
        <div><label className="label">{t('budgetAmount')}</label><input type="number" className="input" placeholder="e.g. 5000" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} min="0" /></div>
        <div>
          <label className="label">{t('color')}</label>
          <div className="flex items-center gap-2 mt-1">
            {COLORS.map(c => <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-border' : 'hover:scale-110'}`} style={{ backgroundColor: c }} />)}
          </div>
        </div>
        {levels.length > 0 && (
          <div className="col-span-2">
            <label className="label">Charging rate per consultant level — Admin only</label>
            <div className="space-y-2 mt-1">
              {levels.map(level => {
                const rType = levelRateTypes[level.id] || 'hourly'
                return (
                  <div key={level.id} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-foreground w-28 flex-shrink-0">{level.name}</span>
                    {/* hourly / daily toggle */}
                    <div className="flex gap-0.5 bg-muted p-0.5 rounded-md flex-shrink-0">
                      {(['hourly', 'daily'] as const).map(rt => (
                        <button key={rt} type="button"
                          onClick={() => setLevelRateTypes(prev => ({ ...prev, [level.id]: rt }))}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${rType === rt ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                          {rt === 'hourly' ? '€/h' : '€/day'}
                        </button>
                      ))}
                    </div>
                    <input type="number" className="input flex-1" placeholder={rType === 'hourly' ? 'e.g. 120' : 'e.g. 960'}
                      value={levelRates[level.id] || ''}
                      onChange={e => setLevelRates(prev => ({ ...prev, [level.id]: e.target.value }))}
                      min="0" step="0.01" />
                    <span className="text-xs text-muted-foreground flex-shrink-0 w-20">
                      {levelRates[level.id] && rType === 'daily'
                        ? `= ${formatMoney(parseFloat(levelRates[level.id]) / 8)}/h`
                        : levelRates[level.id] && rType === 'hourly'
                        ? `= ${formatMoney(parseFloat(levelRates[level.id]) * 8)}/day`
                        : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {activeMembers.length > 0 && (
          <div className="col-span-2">
            <label className="label flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Team — who can book on this project</label>
            <p className="text-xs text-muted-foreground mb-2">Leave all unchecked to allow everyone. Select specific members to restrict access.</p>
            <div className="flex flex-wrap gap-2">
              {activeMembers.map(m => {
                const uid = m.user_id || ''
                const checked = selectedMembers.has(uid)
                const name = m.full_name || m.email || uid
                return (
                  <button key={uid} type="button" onClick={() => toggleMember(uid)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${checked ? 'bg-brand-600/10 border-brand-600/30 text-brand-600' : 'border-border text-muted-foreground hover:border-brand-600/30 hover:text-foreground'}`}>
                    <span className="w-5 h-5 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 text-[10px] font-bold flex-shrink-0">
                      {name[0].toUpperCase()}
                    </span>
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="col-span-2"><label className="label">{t('notes')}</label><textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || !name.trim()} className="btn-primary">{saving ? t('saving') : project ? t('saveChanges') : t('createProject')}</button>
        <button onClick={onCancel} className="btn-secondary">{t('cancel')}</button>
      </div>
    </div>
  )
}
