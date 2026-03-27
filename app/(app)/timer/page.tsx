'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { formatDuration, type Project } from '@/lib/types'
import { Play, Square, Trash2, Pencil, Check, Clock, PenLine, AlertTriangle, StopCircle, Search, X } from 'lucide-react'
import { format } from 'date-fns'

type EntryMode = 'timer' | 'fromto' | 'duration'

function applyRounding(endTime: Date, startTime: Date, roundingMinutes: number): Date {
  if (!roundingMinutes) return endTime
  const durationMs = endTime.getTime() - startTime.getTime()
  const roundMs = roundingMinutes * 60 * 1000
  return new Date(startTime.getTime() + Math.ceil(durationMs / roundMs) * roundMs)
}

const IDLE_THRESHOLD = 3 * 60 * 60

export default function TimerPage() {
  const supabase = createClient()
  const { workspaceId, members, role, effectiveUserId, isProxying } = useWorkspace()
  const { t } = useI18n()

  const [projects, setProjects] = useState<Project[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [running, setRunning] = useState<any | null>(null)
  const [forgottenTimers, setForgottenTimers] = useState<any[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [showIdleAlert, setShowIdleAlert] = useState(false)
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [billable, setBillable] = useState(true)
  const [entryMode, setEntryMode] = useState<EntryMode>('timer')
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [manualStart, setManualStart] = useState('09:00')
  const [manualEnd, setManualEnd] = useState('10:00')
  const [manualHours, setManualHours] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingEntry, setEditingEntry] = useState<any | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const getMemberName = (userId: string) => {
    const m = members.find(m => m.user_id === userId)
    return m?.full_name || m?.email || 'Unknown'
  }

  const load = useCallback(async () => {
    if (!workspaceId) return
    const uid = effectiveUserId
    setCurrentUserId(uid)

    let entriesQuery = supabase
      .from('time_entries')
      .select('*, project:projects(*), level:consultant_levels(*)')
      .eq('workspace_id', workspaceId)
      .not('end_time', 'is', null)
      .order('start_time', { ascending: false })
      .limit(50)

    if (role === 'member') entriesQuery = entriesQuery.eq('user_id', uid)

    const [{ data: proj }, { data: ents }, { data: live }, , forgottenResult, { data: projectMembers }] = await Promise.all([
      supabase.from('projects').select('*').eq('workspace_id', workspaceId).eq('status', 'active').order('name'),
      entriesQuery,
      supabase.from('time_entries').select('*, project:projects(*)').eq('workspace_id', workspaceId).eq('user_id', uid).is('end_time', null).maybeSingle(),
      Promise.resolve({ data: [] }),
      role === 'admin' && !isProxying
        ? supabase.from('time_entries').select('*, project:projects(*)').eq('workspace_id', workspaceId).neq('user_id', uid).is('end_time', null)
        : Promise.resolve({ data: [] }),
      supabase.from('project_members').select('project_id, user_id').eq('workspace_id', workspaceId),
    ])

    let visibleProjects = proj || []
    if (role === 'member') {
      const assignedToMe = new Set((projectMembers || []).filter(pm => pm.user_id === uid).map(pm => pm.project_id))
      const projectsWithAssignments = new Set((projectMembers || []).map(pm => pm.project_id))
      visibleProjects = visibleProjects.filter(p => !projectsWithAssignments.has(p.id) || assignedToMe.has(p.id))
    }
    setProjects(visibleProjects)
    setEntries(ents || [])
    setForgottenTimers((forgottenResult as any)?.data || [])
    if (live) {
      setRunning(live)
      const secs = Math.floor((Date.now() - new Date(live.start_time).getTime()) / 1000)
      setElapsed(secs)
      if (secs >= IDLE_THRESHOLD) setShowIdleAlert(true)
    }
    setLoading(false)
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setElapsed(s => {
        const newVal = s + 1
        if (newVal >= IDLE_THRESHOLD && newVal % 60 === 0) setShowIdleAlert(true)
        return newVal
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  async function startTimer() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const myMember = members.find(m => m.user_id === user.id)
    const autoLevelId = (myMember as any)?.level_id || null
    const { data } = await supabase.from('time_entries').insert({
      user_id: user.id, workspace_id: workspaceId,
      project_id: projectId || null, level_id: autoLevelId,
      description: description || null, billable,
      start_time: new Date().toISOString(),
    }).select('*, project:projects(*)').single()
    if (data) { setRunning(data); setElapsed(0); setShowIdleAlert(false) }
  }

  async function stopTimer(discardIdle = false) {
    if (!running) return
    setShowIdleAlert(false)
    const project = projects.find(p => p.id === running.project_id) as any
    let endTime = new Date()
    if (discardIdle) {
      endTime = new Date(new Date(running.start_time).getTime() + (elapsed - (elapsed % 3600)) * 1000)
    }
    const roundedEnd = applyRounding(endTime, new Date(running.start_time), project?.rounding_minutes || 0)
    await supabase.from('time_entries').update({ end_time: roundedEnd.toISOString() }).eq('id', running.id)
    setRunning(null); setElapsed(0); setDescription(''); setProjectId('')
    load()
  }

  async function stopForgottenTimer(entryId: string) {
    await supabase.from('time_entries').update({ end_time: new Date().toISOString() }).eq('id', entryId)
    load()
  }

  async function discardTimer() {
    if (!running) return
    setShowIdleAlert(false)
    await supabase.from('time_entries').delete().eq('id', running.id)
    setRunning(null); setElapsed(0)
    load()
  }

  async function saveManual() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const proj = projects.find(p => p.id === projectId) as any
    const myMember = members.find(m => m.user_id === user.id)
    const autoLevelId = (myMember as any)?.level_id || null
    let startTime: Date, endTime: Date

    if (entryMode === 'fromto') {
      startTime = new Date(`${manualDate}T${manualStart}`)
      endTime = new Date(`${manualDate}T${manualEnd}`)
      if (endTime <= startTime) { alert('End time must be after start time'); setSaving(false); return }
    } else {
      const hours = parseFloat(manualHours)
      if (!hours || hours <= 0) { alert('Enter a valid number of hours'); setSaving(false); return }
      startTime = new Date(`${manualDate}T${manualStart}`)
      endTime = new Date(startTime.getTime() + hours * 3600 * 1000)
    }
    endTime = applyRounding(endTime, startTime, proj?.rounding_minutes || 0)

    await supabase.from('time_entries').insert({
      user_id: user.id, workspace_id: workspaceId,
      project_id: projectId || null, level_id: autoLevelId,
      description: description || null, billable,
      start_time: startTime.toISOString(), end_time: endTime.toISOString(),
    })
    setSaving(false); setDescription(''); setManualHours('')
    load()
  }

  async function restartEntry(entry: any) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const myMember = members.find(m => m.user_id === user.id)
    const autoLevelId = entry.level_id || (myMember as any)?.level_id || null
    const { data } = await supabase.from('time_entries').insert({
      user_id: user.id, workspace_id: workspaceId,
      project_id: entry.project_id || null, level_id: autoLevelId,
      description: entry.description || null, billable: entry.billable,
      start_time: new Date().toISOString(),
    }).select('*, project:projects(*)').single()
    if (data) {
      setRunning(data); setElapsed(0)
      setDescription(entry.description || ''); setProjectId(entry.project_id || '')
      setBillable(entry.billable)
      setEntryMode('timer'); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function saveEdit() {
    if (!editingEntry) return
    const startTime = new Date(`${editingEntry.editDate}T${editingEntry.editStart}`)
    const endTime = new Date(`${editingEntry.editDate}T${editingEntry.editEnd}`)
    if (endTime <= startTime) { alert('End time must be after start time'); return }
    await supabase.from('time_entries').update({
      description: editingEntry.description || null,
      start_time: startTime.toISOString(), end_time: endTime.toISOString(),
      project_id: editingEntry.project_id || null, billable: editingEntry.billable,
    }).eq('id', editingEntry.id)
    setEditingEntry(null); load()
  }

  async function deleteEntry(id: string) {
    await supabase.from('time_entries').delete().eq('id', id)
    setEntries(e => e.filter(x => x.id !== id))
  }

  function openEdit(entry: any) {
    setEditingEntry({
      ...entry,
      editDate: format(new Date(entry.start_time), 'yyyy-MM-dd'),
      editStart: format(new Date(entry.start_time), 'HH:mm'),
      editEnd: entry.end_time ? format(new Date(entry.end_time), 'HH:mm') : '',
    })
  }

  const filteredEntries = searchQuery.trim()
    ? entries.filter(e => {
        const q = searchQuery.toLowerCase()
        return (
          e.description?.toLowerCase().includes(q) ||
          e.project?.name?.toLowerCase().includes(q) ||
          e.project?.client?.name?.toLowerCase().includes(q) ||
          getMemberName(e.user_id).toLowerCase().includes(q)
        )
      })
    : entries

  const grouped = filteredEntries.reduce<Record<string, any[]>>((acc, e) => {
    const day = format(new Date(e.start_time), 'yyyy-MM-dd')
    if (!acc[day]) acc[day] = []
    acc[day].push(e)
    return acc
  }, {})

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{t('timerTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('timerSubtitle')}</p>
      </div>

      {/* IDLE ALERT */}
      {showIdleAlert && running && (
        <div className="mb-5 card border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-600 dark:text-amber-400 text-sm">{t('idleTitle')} {Math.floor(elapsed / 3600)}h {Math.floor((elapsed % 3600) / 60)}m</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">{t('idleQuestion')}</p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <button onClick={() => stopTimer(false)} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors">{t('idleKeep')}</button>
                <button onClick={() => stopTimer(true)} className="px-3 py-1.5 bg-card border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium rounded-lg hover:bg-amber-500/10 transition-colors">{t('idleTrim')}</button>
                <button onClick={discardTimer} className="px-3 py-1.5 bg-card border border-red-500/30 text-red-500 text-xs font-medium rounded-lg hover:bg-red-500/10 transition-colors">{t('idleDiscard')}</button>
                <button onClick={() => setShowIdleAlert(false)} className="px-3 py-1.5 text-amber-500 text-xs font-medium hover:bg-amber-500/10 rounded-lg transition-colors">{t('idleDismiss')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN: forgotten timers */}
      {role === 'admin' && forgottenTimers.length > 0 && (
        <div className="mb-5 card border-orange-500/30 bg-orange-500/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <StopCircle className="w-4 h-4 text-orange-500" />
            <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">{t('forgottenTimers')}</p>
          </div>
          <div className="space-y-2">
            {forgottenTimers.map((ft: any) => {
              const ftElapsed = Math.floor((Date.now() - new Date(ft.start_time).getTime()) / 1000)
              return (
                <div key={ft.id} className="flex items-center justify-between bg-card rounded-lg px-4 py-3 border border-border">
                  <div>
                    <p className="text-xs font-medium text-foreground">{getMemberName(ft.user_id)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ft.project?.name || t('noProject')} · {t('runningSince')} {format(new Date(ft.start_time), 'MMM d, HH:mm')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-orange-500 font-medium">{formatDuration(ftElapsed)}</span>
                    <button onClick={() => stopForgottenTimer(ft.id)} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                      <Square className="w-3 h-3 fill-current" /> {t('stop')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex gap-0.5 mb-4 bg-muted p-0.5 rounded-lg w-fit">
        {([['timer', t('liveTimer')], ['fromto', t('fromTo')], ['duration', t('enterHours')]] as [EntryMode, string][]).map(([m, label]) => (
          <button key={m} onClick={() => setEntryMode(m)} disabled={!!running && m !== 'timer'}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${entryMode === m ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground disabled:opacity-40'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Timer card */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <input className="input flex-1 min-w-48" placeholder={t('whatWorkingOn')} value={description} onChange={e => setDescription(e.target.value)} disabled={!!running} />
          <select className="input w-44" value={projectId} onChange={e => setProjectId(e.target.value)} disabled={!!running}>
            <option value="">{t('noProject')}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" className="rounded accent-brand-600" checked={billable} onChange={e => setBillable(e.target.checked)} disabled={!!running} />
            {t('billable')}
          </label>
        </div>

        {entryMode === 'timer' && (
          <div className="flex items-center gap-4">
            <span className="font-mono text-3xl font-bold text-foreground tabular-nums">{formatDuration(elapsed)}</span>
            {running ? (
              <button onClick={() => stopTimer(false)} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-medium px-5 py-2 rounded-lg transition-colors text-sm">
                <Square className="w-4 h-4 fill-current" /> {t('stop')}
              </button>
            ) : (
              <button onClick={startTimer} disabled={isProxying} className="flex items-center gap-2 btn-primary px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                <Play className="w-4 h-4 fill-current" /> {t('start')}
              </button>
            )}
            {running && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {t('runningSince')} {format(new Date(running.start_time), 'HH:mm')}
              </p>
            )}
          </div>
        )}

        {entryMode === 'fromto' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div><label className="label">{t('date')}</label><input type="date" className="input w-40" value={manualDate} onChange={e => setManualDate(e.target.value)} /></div>
            <div><label className="label">{t('from')}</label><input type="time" className="input w-32" value={manualStart} onChange={e => setManualStart(e.target.value)} /></div>
            <div><label className="label">{t('to')}</label><input type="time" className="input w-32" value={manualEnd} onChange={e => setManualEnd(e.target.value)} /></div>
            <div className="mt-5"><button onClick={saveManual} disabled={saving} className="btn-primary flex items-center gap-2 text-sm"><PenLine className="w-3.5 h-3.5" />{saving ? t('saving') : t('addEntry')}</button></div>
          </div>
        )}

        {entryMode === 'duration' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div><label className="label">{t('date')}</label><input type="date" className="input w-40" value={manualDate} onChange={e => setManualDate(e.target.value)} /></div>
            <div><label className="label">{t('runningSince')}</label><input type="time" className="input w-32" value={manualStart} onChange={e => setManualStart(e.target.value)} /></div>
            <div><label className="label">{t('hours')}</label><input type="number" className="input w-28" placeholder="e.g. 1.5" value={manualHours} onChange={e => setManualHours(e.target.value)} min="0.1" step="0.25" /></div>
            <div className="mt-5"><button onClick={saveManual} disabled={saving} className="btn-primary flex items-center gap-2 text-sm"><PenLine className="w-3.5 h-3.5" />{saving ? t('saving') : t('addEntry')}</button></div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-semibold text-foreground mb-5 text-sm">{t('editEntry')}</h3>
            <div className="space-y-4">
              <div><label className="label">{t('description')}</label><input className="input" value={editingEntry.description || ''} onChange={e => setEditingEntry({ ...editingEntry, description: e.target.value })} placeholder={t('whatWorkingOn')} /></div>
              <div>
                <label className="label">{t('projects')}</label>
                <select className="input" value={editingEntry.project_id || ''} onChange={e => setEditingEntry({ ...editingEntry, project_id: e.target.value })}>
                  <option value="">{t('noProject')}</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">{t('date')}</label><input type="date" className="input" value={editingEntry.editDate} onChange={e => setEditingEntry({ ...editingEntry, editDate: e.target.value })} /></div>
                <div><label className="label">{t('from')}</label><input type="time" className="input" value={editingEntry.editStart} onChange={e => setEditingEntry({ ...editingEntry, editStart: e.target.value })} /></div>
                <div><label className="label">{t('to')}</label><input type="time" className="input" value={editingEntry.editEnd} onChange={e => setEditingEntry({ ...editingEntry, editEnd: e.target.value })} /></div>
              </div>
              <div><label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"><input type="checkbox" className="accent-brand-600" checked={editingEntry.billable} onChange={e => setEditingEntry({ ...editingEntry, billable: e.target.checked })} />{t('billable')}</label></div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={saveEdit} className="btn-primary flex items-center gap-2 text-sm"><Check className="w-3.5 h-3.5" />{t('saveChanges')}</button>
              <button onClick={() => setEditingEntry(null)} className="btn-secondary text-sm">{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {entries.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <input
            className="input pl-9 pr-8 text-sm"
            placeholder="Search entries…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Entries */}
      {Object.keys(grouped).length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{t('noEntriesYet')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('startTimerHint')}</p>
        </div>
      ) : Object.entries(grouped).map(([day, dayEntries]) => {
        const dayTotal = dayEntries.reduce((s, e) => s + (e.duration_sec || 0), 0)
        return (
          <div key={day} className="mb-5">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-muted-foreground">{format(new Date(day), 'EEEE, MMMM d')}</span>
              <span className="text-xs font-mono font-semibold text-muted-foreground">{formatDuration(dayTotal)}</span>
            </div>
            <div className="card divide-y divide-border">
              {dayEntries.map((entry: any) => (
                <div key={entry.id} className="px-4 py-3.5 flex items-center gap-3 group hover:bg-muted/30 transition-colors">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.project?.color || '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {entry.description || <span className="italic text-muted-foreground/60 font-normal">{t('noDescription')}</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        {entry.project?.name || t('noProject')}
                        {entry.level && <span className="ml-1">· {entry.level.name}</span>}
                        {' · '}{format(new Date(entry.start_time), 'HH:mm')} – {entry.end_time ? format(new Date(entry.end_time), 'HH:mm') : '…'}
                        {role === 'admin' && entry.user_id !== currentUserId && <span className="ml-1 text-muted-foreground/50">· {getMemberName(entry.user_id)}</span>}
                      </p>
                      {entry.billable && <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">{t('billable')}</span>}
                    </div>
                  </div>
                  <span className="font-mono text-xs font-semibold text-muted-foreground tabular-nums">{entry.duration_sec ? formatDuration(entry.duration_sec) : '—'}</span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    {!running && (
                      <button onClick={() => restartEntry(entry)} className="p-1.5 text-muted-foreground/50 hover:text-emerald-500 rounded-lg hover:bg-emerald-500/10" title={t('start')}>
                        <Play className="w-3 h-3 fill-current" />
                      </button>
                    )}
                    {entry.user_id === currentUserId && (
                      <>
                        <button onClick={() => openEdit(entry)} className="p-1.5 text-muted-foreground/50 hover:text-foreground rounded-lg hover:bg-muted"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => deleteEntry(entry.id)} className="p-1.5 text-muted-foreground/50 hover:text-red-500 rounded-lg hover:bg-red-500/10"><Trash2 className="w-3 h-3" /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
