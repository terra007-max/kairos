'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { formatDuration } from '@/lib/types'
import {
  format, startOfWeek, endOfWeek, subWeeks, addWeeks, getISOWeek,
  isFriday, isSaturday, isSunday, isAfter,
} from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import {
  CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, ClipboardList,
  AlertCircle, Lock, Unlock, Umbrella, Sun, Plane,
} from 'lucide-react'

type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

type ProjectSummary = { id: string; name: string; hours: number; managerId?: string | null }

type ReviewEvent = { status: 'approved' | 'rejected'; note: string | null; reviewed_at: string }

type Timesheet = {
  id: string
  user_id: string
  workspace_id: string
  week_start: string
  status: TimesheetStatus
  note: string | null
  reviewer_note: string | null
  submitted_at: string | null
  reviewed_at: string | null
  review_history?: ReviewEvent[]
  project_approvals?: Record<string, { status: 'approved' | 'rejected'; by: string; at: string }>
  total_seconds?: number
  projectSummary?: ProjectSummary[]
  locked?: boolean
  locked_at?: string | null
}

type TimeOffEntry = {
  id: string
  user_id: string
  workspace_id: string
  date: string
  type: 'vacation' | 'holiday' | 'sick'
  hours: number
  notes: string | null
}

const TIME_OFF_LABELS: Record<string, string> = {
  vacation: 'Vacation',
  holiday:  'Public Holiday',
  sick:     'Sick Day',
}

const TIME_OFF_ICONS: Record<string, typeof Umbrella> = {
  vacation: Plane,
  holiday:  Sun,
  sick:     Umbrella,
}

function StatusBadge({ status, locked, t }: { status: TimesheetStatus; locked?: boolean; t: (k: any) => string }) {
  if (locked) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500">
      <Lock className="w-3 h-3" /> {t('lockedStatus')}
    </span>
  )
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <CheckCircle className="w-3 h-3" /> {t('approved')}
    </span>
  )
  if (status === 'rejected') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <XCircle className="w-3 h-3" /> {t('returnedStatus')}
    </span>
  )
  if (status === 'submitted') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <Clock className="w-3 h-3" /> {t('submitted')}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <Clock className="w-3 h-3" /> {t('draft')}
    </span>
  )
}

/** Returns true if the Sunday 23:00 deadline for the given week has passed */
function isDeadlinePassed(weekStart: Date): boolean {
  const deadline = new Date(endOfWeek(weekStart, { weekStartsOn: 1 }))
  deadline.setHours(23, 0, 0, 0)
  return isAfter(new Date(), deadline)
}

export default function TimesheetsPage() {
  const supabase = createClient()
  const { workspaceId, role, members, effectiveUserId, isProxying, managedProjectIds, isProjectManager } = useWorkspace()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS

  const [userId, setUserId] = useState('')
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [myTimesheets, setMyTimesheets]     = useState<Timesheet[]>([])
  const [teamTimesheets, setTeamTimesheets] = useState<(Timesheet & { user_email?: string; user_name?: string })[]>([])
  const [weekTotalSec, setWeekTotalSec]     = useState(0)
  const [timeOffEntries, setTimeOffEntries] = useState<TimeOffEntry[]>([])
  const [note, setNote]             = useState('')
  const [reviewerNote, setReviewerNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading]       = useState(true)
  const canReview = can(role, 'review:all') || isProjectManager
  const [activeTab, setActiveTab]   = useState<'mine' | 'team'>(canReview ? 'team' : 'mine')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [dbError, setDbError]       = useState(false)
  const [weekProjectPMs, setWeekProjectPMs] = useState<{ projectName: string; pmName: string }[]>([])

  // Time-off add form
  const [addingTimeOff, setAddingTimeOff]     = useState(false)
  const [newToDate, setNewToDate]             = useState(format(new Date(), 'yyyy-MM-dd'))
  const [newToType, setNewToType]             = useState<'vacation' | 'holiday' | 'sick'>('vacation')
  const [newToHours, setNewToHours]           = useState('8')

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })

  function fmtRange(start: Date) {
    const end = endOfWeek(start, { weekStartsOn: 1 })
    const kw  = getISOWeek(start)
    const cwLabel = locale === 'de' ? 'KW' : 'CW'
    return `${cwLabel} ${kw} · ${format(start, 'd. MMM', { locale: dateFnsLocale })} – ${format(end, 'd. MMM yyyy', { locale: dateFnsLocale })}`
  }

  // ── Auto-lock: mark past-deadline draft timesheets as locked ──────────────
  const autoLockPastWeeks = useCallback(async (sheets: Timesheet[]) => {
    const toUpdate = sheets
      .filter(ts => ts.status === 'draft' && !ts.locked && isDeadlinePassed(new Date(ts.week_start)))
      .map(ts => ts.id)

    if (toUpdate.length === 0) return sheets

    await supabase.from('timesheets')
      .update({ locked: true, locked_at: new Date().toISOString() })
      .in('id', toUpdate)

    return sheets.map(ts => toUpdate.includes(ts.id) ? { ...ts, locked: true } : ts)
  }, [supabase])

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    const uid = effectiveUserId
    setUserId(uid)

    // Admin does not participate in time recording — skip all personal time fetches
    if (can(role, 'record:time')) {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('duration_sec, project_id, project:projects(name, manager_id)')
        .eq('user_id', uid)
        .not('end_time', 'is', null)
        .gte('start_time', currentWeekStart.toISOString())
        .lte('start_time', weekEnd.toISOString())
      setWeekTotalSec((entries || []).reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))

      // Build per-project PM list for the member's "routed to" display
      const seen = new Set<string>()
      const pms: { projectName: string; pmName: string }[] = []
      for (const e of entries || []) {
        const p = (e as any).project
        if (!p || !p.manager_id || seen.has(e.project_id)) continue
        seen.add(e.project_id)
        const pm = members.find(m => m.user_id === p.manager_id)
        if (pm) pms.push({ projectName: p.name, pmName: pm.full_name || pm.email })
      }
      setWeekProjectPMs(pms)

      const { data: myTs, error } = await supabase
        .from('timesheets')
        .select('*')
        .eq('user_id', uid)
        .eq('workspace_id', workspaceId)
        .order('week_start', { ascending: false })

      if (error?.code === '42P01') { setDbError(true); setLoading(false); return }

      const lockedTs = await autoLockPastWeeks(myTs || [])
      setMyTimesheets(lockedTs)

      // Fetch time-off for the viewed week
      const { data: toEntries } = await supabase
        .from('time_off_entries')
        .select('*')
        .eq('user_id', uid)
        .eq('workspace_id', workspaceId)
        .gte('date', format(currentWeekStart, 'yyyy-MM-dd'))
        .lte('date', format(weekEnd, 'yyyy-MM-dd'))
      setTimeOffEntries((toEntries as TimeOffEntry[]) || [])
    }

    if (canReview) {
      const { data: teamTs } = await supabase
        .from('timesheets')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('week_start', { ascending: false })
        .limit(100)

      let pmUserIds: string[] | null = null
      if (!can(role, 'review:all') && isProjectManager && managedProjectIds.length > 0) {
        // Use time_entries to find users who have actually worked on managed projects
        // (project_members only tracks booking restrictions, not actual team members)
        const { data: entryRows } = await supabase
          .from('time_entries')
          .select('user_id')
          .in('project_id', managedProjectIds)
          .eq('workspace_id', workspaceId)
        pmUserIds = Array.from(new Set((entryRows || []).map((r: any) => r.user_id)))
        // If no entries yet, fall back to project_members (explicit access list)
        if (pmUserIds.length === 0) {
          const { data: pmRows } = await supabase
            .from('project_members').select('user_id').in('project_id', managedProjectIds)
          pmUserIds = Array.from(new Set((pmRows || []).map((r: any) => r.user_id)))
        }
        // If still empty (open project, no entries yet) → show all workspace members
        if (pmUserIds.length === 0) pmUserIds = null
      }

      const entryQuery = supabase
        .from('time_entries')
        .select('user_id, project_id, duration_sec, start_time, project:projects(name, manager_id)')
        .eq('workspace_id', workspaceId)
        .not('end_time', 'is', null)

      const { data: allEntries } = can(role, 'review:all') || pmUserIds === null
        ? await entryQuery
        : pmUserIds.length > 0
          ? await entryQuery.in('user_id', pmUserIds)
          : { data: [] }

      const enriched = (teamTs || [])
        .filter(ts => ts.user_id !== uid)
        .filter(ts => {
          // Admin/partner: see all
          if (!pmUserIds) return true
          // PM: only show timesheets where this specific week has entries on their managed projects
          // (not just "this user ever worked on a managed project")
          const weekStart   = new Date(ts.week_start)
          const weekEndDate = endOfWeek(weekStart, { weekStartsOn: 1 })
          return (allEntries || []).some((e: any) =>
            e.user_id === ts.user_id &&
            managedProjectIds.includes(e.project_id) &&
            new Date(e.start_time) >= weekStart &&
            new Date(e.start_time) <= weekEndDate
          )
        })
        .map(ts => {
          const member      = members.find(m => m.user_id === ts.user_id)
          const weekStart   = new Date(ts.week_start)
          const weekEndDate = endOfWeek(weekStart, { weekStartsOn: 1 })

          const tsEntries = (allEntries || []).filter((e: any) => {
            if (e.user_id !== ts.user_id) return false
            const d = new Date(e.start_time)
            return d >= weekStart && d <= weekEndDate
          })
          const projectMap: Record<string, { name: string; secs: number; managerId: string | null }> = {}
          for (const e of tsEntries) {
            if (!e.project_id) continue
            const name = (e.project as any)?.name || e.project_id
            const managerId = (e.project as any)?.manager_id || null
            if (!projectMap[e.project_id]) projectMap[e.project_id] = { name, secs: 0, managerId }
            projectMap[e.project_id].secs += e.duration_sec || 0
          }
          const projectSummary = Object.entries(projectMap)
            .map(([id, p]) => ({ id, name: p.name, hours: p.secs / 3600, managerId: p.managerId }))
            .sort((a, b) => b.hours - a.hours)

          return { ...ts, user_email: member?.email, user_name: member?.full_name, projectSummary }
        })
      setTeamTimesheets(enriched)
    }
    setLoading(false)
  }, [supabase, workspaceId, role, members, currentWeekStart, isProjectManager, managedProjectIds, autoLockPastWeeks])

  useEffect(() => { loadData() }, [loadData])

  const currentWeekTs = myTimesheets.find(
    ts => ts.week_start === format(currentWeekStart, 'yyyy-MM-dd')
  )

  // Is the currently viewed week locked (by flag OR past deadline)?
  const viewedWeekIsLocked = useMemo(() => {
    if (currentWeekTs?.locked) return true
    if (!currentWeekTs && isDeadlinePassed(currentWeekStart)) return true
    return false
  }, [currentWeekTs, currentWeekStart])

  // Friday / weekend reminder for the current calendar week
  const today = new Date()
  const thisCalendarWeek = startOfWeek(today, { weekStartsOn: 1 })
  const isViewingCurrentWeek = format(currentWeekStart, 'yyyy-MM-dd') === format(thisCalendarWeek, 'yyyy-MM-dd')
  const isDeadlinePeriod = isFriday(today) || isSaturday(today) || isSunday(today)
  const showDeadlineReminder = (
    isViewingCurrentWeek &&
    isDeadlinePeriod &&
    !isDeadlinePassed(currentWeekStart) &&
    (!currentWeekTs || currentWeekTs.status === 'draft' || currentWeekTs.status === 'rejected')
  )

  async function submitTimesheet() {
    setSubmitting(true)
    const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd')
    if (currentWeekTs) {
      await supabase.from('timesheets').update({
        status: 'submitted', note: note || null, submitted_at: new Date().toISOString(),
      }).eq('id', currentWeekTs.id)
    } else {
      await supabase.from('timesheets').insert({
        user_id: userId, workspace_id: workspaceId, week_start: weekStartStr,
        status: 'submitted', note: note || null, submitted_at: new Date().toISOString(),
      })
    }
    setNote(''); setSubmitting(false); loadData()
  }

  async function withdrawTimesheet() {
    if (!currentWeekTs) return
    await supabase.from('timesheets').update({ status: 'draft', submitted_at: null }).eq('id', currentWeekTs.id)
    loadData()
  }

  async function reviewTimesheet(id: string, status: 'approved' | 'rejected', projectId?: string) {
    await fetch('/api/timesheets/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timesheetId: id, status, reviewerNote: reviewerNote || null, workspaceId, projectId }),
    })
    setReviewingId(null); setReviewerNote(''); loadData()
  }

  async function unlockTimesheet(id: string) {
    await supabase.from('timesheets').update({
      locked: false, locked_at: null, locked_by: null,
    }).eq('id', id)
    loadData()
  }

  async function addTimeOff() {
    const hours = parseFloat(newToHours)
    if (!hours || hours <= 0) return
    await supabase.from('time_off_entries').upsert({
      workspace_id: workspaceId,
      user_id: userId || effectiveUserId,
      date: newToDate,
      type: newToType,
      hours,
    }, { onConflict: 'workspace_id,user_id,date' })
    setAddingTimeOff(false)
    setNewToDate(format(currentWeekStart, 'yyyy-MM-dd'))
    loadData()
  }

  async function removeTimeOff(id: string) {
    await supabase.from('time_off_entries').delete().eq('id', id)
    loadData()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (dbError) return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{t('timesheetsTitle')}</h1>
      </div>
      <div className="card p-6 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground mb-1">Database migration required</p>
          <p className="text-xs text-muted-foreground mb-3">
            The <code className="bg-muted px-1 rounded">timesheets</code> table does not exist yet.
            Run the migration in your Supabase SQL editor.
          </p>
        </div>
      </div>
    </div>
  )

  const timeOffThisWeek = timeOffEntries.reduce((s, e) => s + e.hours, 0)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">{t('timesheetsTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {canReview ? t('timesheetsAdminSubtitle') : t('timesheetsSubtitle')}
        </p>
      </div>

      {canReview && (
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl mb-6 w-fit">
          {(['mine', 'team'] as const).filter(tab => !(tab === 'mine' && !can(role, 'record:time'))).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab === 'mine' ? t('myTimesheets') : t('reviewTimesheets')}
              {tab === 'team' && teamTimesheets.filter(ts => ts.status === 'submitted').length > 0 && (
                <span className="ml-2 bg-amber-500/10 text-amber-600 text-xs px-1.5 py-0.5 rounded-full">
                  {teamTimesheets.filter(ts => ts.status === 'submitted').length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── My Timesheets ────────────────────────────────────────────────────── */}
      {activeTab === 'mine' && (
        <div className="max-w-xl space-y-4">

          {/* Friday / weekend deadline reminder */}
          {showDeadlineReminder && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {isFriday(today) ? t('deadlineToday') : t('deadlineApproaching')}
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">
                  {t('deadlineReminderBody')}
                </p>
              </div>
            </div>
          )}

          <div className="card p-6">
            {/* Week navigation */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentWeekStart(w => subWeeks(w, 1))}
                  className="p-1 hover:bg-muted rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <div>
                  <p className="text-sm font-semibold text-foreground">{fmtRange(currentWeekStart)}</p>
                </div>
                {/* Future weeks allowed — no disabled state */}
                <button
                  onClick={() => setCurrentWeekStart(w => addWeeks(w, 1))}
                  className="p-1 hover:bg-muted rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <StatusBadge
                status={currentWeekTs?.status || 'draft'}
                locked={viewedWeekIsLocked}
                t={t}
              />
            </div>

            {/* Hours tracked */}
            <div className="bg-muted/30 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground font-medium">
                  {(weekTotalSec / 3600).toFixed(1)}h {t('weekHours')}
                </span>
              </div>
              {timeOffThisWeek > 0 && (
                <span className="text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1">
                  <Plane className="w-3 h-3" />
                  {timeOffThisWeek.toFixed(0)}h time off
                </span>
              )}
            </div>

            {/* Locked state */}
            {viewedWeekIsLocked && (
              <div className="bg-slate-500/10 border border-slate-500/20 rounded-lg p-4 mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Lock className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('weekLocked')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {currentWeekTs?.locked_at
                        ? `${t('weekLockedAt')} ${format(new Date(currentWeekTs.locked_at), 'd. MMM yyyy, HH:mm')}.`
                        : t('weekLockedDeadline')}
                      {!canReview && ` ${t('contactPMToUnlock')}`}
                    </p>
                  </div>
                </div>
                {canReview && currentWeekTs && (
                  <button
                    onClick={() => unlockTimesheet(currentWeekTs.id)}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 text-sky-600 border-sky-500/20 hover:bg-sky-500/10 flex-shrink-0"
                  >
                    <Unlock className="w-3 h-3" /> {t('unlock')}
                  </button>
                )}
              </div>
            )}

            {/* Returned feedback */}
            {currentWeekTs?.status === 'rejected' && currentWeekTs.reviewer_note && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">{t('returnedForAdditions')}</p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80">{currentWeekTs.reviewer_note}</p>
              </div>
            )}

            {/* Submit form — shown when editable */}
            {!viewedWeekIsLocked && (!currentWeekTs || currentWeekTs.status === 'draft' || currentWeekTs.status === 'rejected') && (
              <div className="space-y-3">
                <div>
                  <label className="label">{t('weeklyNote')}</label>
                  <textarea
                    className="input resize-none"
                    rows={2}
                    placeholder={t('weeklyNote')}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                  />
                </div>
                <button
                  onClick={submitTimesheet}
                  disabled={submitting || weekTotalSec === 0 || isProxying}
                  className="btn-primary w-full disabled:opacity-40"
                >
                  {submitting ? t('submitting') : t('submitForReview')}
                </button>
                {weekTotalSec === 0 && (
                  <p className="text-xs text-muted-foreground text-center">{t('trackBeforeSubmitting')}</p>
                )}
              </div>
            )}

            {currentWeekTs?.status === 'submitted' && (
              <div className="space-y-3">
                {currentWeekTs.note && <p className="text-xs text-muted-foreground italic">"{currentWeekTs.note}"</p>}
                {weekProjectPMs.length > 0 && (
                  <div className="bg-muted/30 rounded-lg px-3 py-2.5 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{t('routedTo')}</p>
                    {weekProjectPMs.map(({ projectName, pmName }) => (
                      <div key={projectName} className="flex items-center justify-between">
                        <span className="text-xs text-foreground">{projectName}</span>
                        <span className="text-xs font-medium text-brand-600 dark:text-brand-400">{pmName}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={withdrawTimesheet} className="btn-secondary w-full text-sm">{t('withdrawSubmission')}</button>
              </div>
            )}

            {currentWeekTs?.status === 'approved' && (
              <div className="text-center py-2">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{t('timesheetApproved')}</p>
                {currentWeekTs.note && <p className="text-xs text-muted-foreground mt-1 italic">"{currentWeekTs.note}"</p>}
              </div>
            )}
          </div>

          {/* ── Time Off section ────────────────────────────────────────── */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('timeOffTitle')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('timeOffSubtitle')}</p>
              </div>
              {!addingTimeOff && (
                <button
                  onClick={() => {
                    setAddingTimeOff(true)
                    setNewToDate(format(currentWeekStart, 'yyyy-MM-dd'))
                  }}
                  className="btn-secondary text-xs py-1 px-2.5"
                >
                  {t('addDay')}
                </button>
              )}
            </div>

            {addingTimeOff && (
              <div className="bg-muted/30 rounded-lg p-3 mb-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">{t('timeOffDate')}</label>
                    <input
                      type="date"
                      className="input text-sm"
                      value={newToDate}
                      onChange={e => setNewToDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">{t('timeOffType')}</label>
                    <select
                      className="input text-sm"
                      value={newToType}
                      onChange={e => setNewToType(e.target.value as any)}
                    >
                      <option value="vacation">{t('timeOffVacation')}</option>
                      <option value="holiday">{t('timeOffHoliday')}</option>
                      <option value="sick">{t('timeOffSick')}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Hours</label>
                  <input
                    type="number"
                    className="input text-sm"
                    value={newToHours}
                    min="1" max="24" step="0.5"
                    onChange={e => setNewToHours(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={addTimeOff} className="btn-primary text-xs py-1.5 px-3">Save</button>
                  <button onClick={() => setAddingTimeOff(false)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
                </div>
              </div>
            )}

            {timeOffEntries.length === 0 && !addingTimeOff ? (
              <p className="text-xs text-muted-foreground">{t('noTimeOff')}</p>
            ) : (
              <div className="space-y-1.5">
                {timeOffEntries.map(entry => {
                  const Icon = TIME_OFF_ICONS[entry.type] || Umbrella
                  return (
                    <div key={entry.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-sky-500" />
                        <span className="text-xs font-medium text-foreground">
                          {entry.type === 'vacation' ? t('timeOffVacation') : entry.type === 'holiday' ? t('timeOffHoliday') : t('timeOffSick')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.date), 'EEE d. MMM', { locale: dateFnsLocale })} · {entry.hours}h
                        </span>
                      </div>
                      <button
                        onClick={() => removeTimeOff(entry.id)}
                        className="text-xs text-muted-foreground/50 hover:text-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {timeOffThisWeek > 0 && (
              <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border">
                {timeOffThisWeek.toFixed(0)}h {t('timeOffImpact')}
              </p>
            )}
          </div>

          {/* Previous weeks list */}
          {myTimesheets.filter(ts => ts.week_start !== format(currentWeekStart, 'yyyy-MM-dd')).length > 0 && (
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('previousWeeks')}</h2>
              <div className="space-y-2">
                {myTimesheets
                  .filter(ts => ts.week_start !== format(currentWeekStart, 'yyyy-MM-dd'))
                  .map(ts => (
                    <div key={ts.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-xs font-medium text-foreground">{fmtRange(new Date(ts.week_start))}</p>
                        {ts.note && <p className="text-xs text-muted-foreground italic mt-0.5">"{ts.note}"</p>}
                      </div>
                      <StatusBadge status={ts.status} locked={ts.locked} t={t} />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {myTimesheets.length === 0 && (
            <div className="card p-8 text-center">
              <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{t('noTimesheets')}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Review tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'team' && canReview && (
        <div className="space-y-3">
          {teamTimesheets.length === 0 ? (
            <div className="card p-8 text-center">
              <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{t('noTimesheets')}</p>
            </div>
          ) : teamTimesheets.map(ts => {
            const isReviewing = reviewingId === ts.id
            const totalHours  = (ts.projectSummary || []).reduce((s, p) => s + p.hours, 0)
            return (
              <div key={ts.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {ts.user_name || ts.user_email || 'Unknown'}
                      </span>
                      <StatusBadge status={ts.status} locked={ts.locked} t={t} />
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtRange(new Date(ts.week_start))}</p>

                    {ts.projectSummary && ts.projectSummary.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ts.projectSummary.map(p => {
                          const approval = ts.project_approvals?.[p.id]
                          return (
                            <span key={p.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs ${approval?.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted/60 text-muted-foreground'}`}>
                              {approval?.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                              <span className="font-medium text-foreground">{p.name}</span>
                              <span>{p.hours.toFixed(1)}h</span>
                            </span>
                          )
                        })}
                        <span className="inline-flex items-center px-2 py-0.5 bg-brand-600/10 rounded-md text-xs font-semibold text-brand-600">
                          {totalHours.toFixed(1)}h {locale === 'de' ? 'gesamt' : 'total'}
                        </span>
                      </div>
                    )}
                    {ts.note && <p className="text-xs text-muted-foreground italic mt-1.5">"{ts.note}"</p>}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Unlock button for locked timesheets */}
                    {ts.locked && (
                      <button
                        onClick={() => unlockTimesheet(ts.id)}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 text-sky-600 border-sky-500/20 hover:bg-sky-500/10"
                      >
                        <Unlock className="w-3 h-3" /> {t('unlock')}
                      </button>
                    )}
                    {ts.status === 'submitted' && !isReviewing && (
                      <button onClick={() => setReviewingId(ts.id)} className="btn-secondary text-xs py-1 px-2.5">
                        {t('reviewButton')}
                      </button>
                    )}
                    {ts.status === 'approved' && !isReviewing && (
                      <button
                        onClick={() => setReviewingId(ts.id)}
                        className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
                      >
                        {t('returnButton')}
                      </button>
                    )}
                  </div>
                </div>

                {isReviewing && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <div>
                      <label className="label">{t('reviewerNote')}</label>
                      <textarea
                        className="input resize-none"
                        rows={2}
                        value={reviewerNote}
                        onChange={e => setReviewerNote(e.target.value)}
                        placeholder={t('reviewerFeedbackPlaceholder')}
                      />
                    </div>

                    {/* PM: per-project approve buttons */}
                    {!can(role, 'review:all') && isProjectManager && ts.projectSummary && ts.projectSummary.length > 0 ? (
                      <div className="space-y-2">
                        {ts.projectSummary.map(p => {
                          const isMyProject = managedProjectIds.includes(p.id)
                          const approval = ts.project_approvals?.[p.id]
                          if (!isMyProject) return null
                          return (
                            <div key={p.id} className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded-lg">
                              <span className="text-xs font-medium text-foreground">{p.name} · {p.hours.toFixed(1)}h</span>
                              {approval?.status === 'approved' ? (
                                <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle className="w-3 h-3" />{t('approved')}</span>
                              ) : (
                                <div className="flex gap-1.5">
                                  <button onClick={() => reviewTimesheet(ts.id, 'approved', p.id)} className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> {t('approveTimesheet')}
                                  </button>
                                  <button onClick={() => reviewTimesheet(ts.id, 'rejected', p.id)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-amber-600 border-amber-500/20 hover:bg-amber-500/10">
                                    <XCircle className="w-3 h-3" /> {t('returnToMember')}
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        <button onClick={() => setReviewingId(null)} className="btn-secondary text-xs px-3">{t('cancel')}</button>
                      </div>
                    ) : (
                      /* Admin / Partner: single approve for entire timesheet */
                      <div className="flex gap-2">
                        {ts.status !== 'approved' && (
                          <button onClick={() => reviewTimesheet(ts.id, 'approved')} className="btn-primary flex items-center gap-1.5 flex-1">
                            <CheckCircle className="w-3.5 h-3.5" /> {t('approveTimesheet')}
                          </button>
                        )}
                        <button
                          onClick={() => reviewTimesheet(ts.id, 'rejected')}
                          className="btn-secondary flex items-center gap-1.5 flex-1 text-amber-600 border-amber-500/20 hover:bg-amber-500/10"
                        >
                          <XCircle className="w-3.5 h-3.5" /> {t('returnToMember')}
                        </button>
                        <button onClick={() => setReviewingId(null)} className="btn-secondary px-3">{t('cancel')}</button>
                      </div>
                    )}
                  </div>
                )}

                {ts.review_history && ts.review_history.length > 0 && !isReviewing && (
                  <div className="border-t border-border pt-2 mt-1 space-y-1">
                    {ts.review_history.map((ev, i) => (
                      <p key={i} className="text-xs text-muted-foreground italic">
                        <span className={ev.status === 'approved' ? 'text-emerald-500' : 'text-amber-500'}>
                          {ev.status === 'approved' ? t('historyApproved') : t('historyReturned')}
                        </span>
                        {ev.note && ` — "${ev.note}"`}
                        <span className="text-muted-foreground/50 ml-1">{new Date(ev.reviewed_at).toLocaleDateString()}</span>
                      </p>
                    ))}
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
