'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { formatDuration } from '@/lib/types'
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, getISOWeek } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, ClipboardList, AlertCircle } from 'lucide-react'

type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

type ProjectSummary = { name: string; hours: number }

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
  total_seconds?: number
  projectSummary?: ProjectSummary[]
}

function StatusBadge({ status, t }: { status: TimesheetStatus; t: (k: any) => string }) {
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <CheckCircle className="w-3 h-3" /> {t('approved')}
    </span>
  )
  if (status === 'rejected') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500">
      <XCircle className="w-3 h-3" /> {t('rejected')}
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

export default function TimesheetsPage() {
  const supabase = createClient()
  const { workspaceId, role, members, effectiveUserId, isProxying } = useWorkspace()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS

  const [userId, setUserId] = useState('')
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [myTimesheets, setMyTimesheets] = useState<Timesheet[]>([])
  const [teamTimesheets, setTeamTimesheets] = useState<(Timesheet & { user_email?: string; user_name?: string })[]>([])
  const [weekTotalSec, setWeekTotalSec] = useState(0)
  const [note, setNote] = useState('')
  const [reviewerNote, setReviewerNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'mine' | 'team'>(role === 'admin' ? 'team' : 'mine')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [dbError, setDbError] = useState(false)

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })

  function fmtRange(start: Date) {
    const end = endOfWeek(start, { weekStartsOn: 1 })
    const kw = getISOWeek(start)
    return `KW ${kw} · ${format(start, 'd. MMM', { locale: dateFnsLocale })} – ${format(end, 'd. MMM yyyy', { locale: dateFnsLocale })}`
  }

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    const uid = effectiveUserId
    setUserId(uid)

    const { data: entries } = await supabase
      .from('time_entries')
      .select('duration_sec')
      .eq('user_id', uid)
      .not('end_time', 'is', null)
      .gte('start_time', currentWeekStart.toISOString())
      .lte('start_time', weekEnd.toISOString())
    setWeekTotalSec((entries || []).reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))

    const { data: myTs, error } = await supabase
      .from('timesheets')
      .select('*')
      .eq('user_id', uid)
      .eq('workspace_id', workspaceId)
      .order('week_start', { ascending: false })

    if (error?.code === '42P01') {
      setDbError(true)
      setLoading(false)
      return
    }
    setMyTimesheets(myTs || [])

    if (role === 'admin') {
      const { data: teamTs } = await supabase
        .from('timesheets')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('week_start', { ascending: false })
        .limit(50)

      // Load time entries for all team timesheets to build project summaries
      const { data: allEntries } = await supabase
        .from('time_entries')
        .select('user_id, project_id, duration_sec, start_time, project:projects(name)')
        .eq('workspace_id', workspaceId)
        .not('end_time', 'is', null)

      const enriched = (teamTs || []).map(ts => {
        const member = members.find(m => m.user_id === ts.user_id)
        const weekStart = new Date(ts.week_start)
        const weekEndDate = endOfWeek(weekStart, { weekStartsOn: 1 })

        // Build project summary for this user's week
        const tsEntries = (allEntries || []).filter(e => {
          if (e.user_id !== ts.user_id) return false
          const d = new Date(e.start_time)
          return d >= weekStart && d <= weekEndDate
        })
        const projectMap: Record<string, { name: string; secs: number }> = {}
        for (const e of tsEntries) {
          if (!e.project_id) continue
          const name = (e.project as any)?.name || e.project_id
          if (!projectMap[e.project_id]) projectMap[e.project_id] = { name, secs: 0 }
          projectMap[e.project_id].secs += e.duration_sec || 0
        }
        const projectSummary: ProjectSummary[] = Object.values(projectMap)
          .map(p => ({ name: p.name, hours: p.secs / 3600 }))
          .sort((a, b) => b.hours - a.hours)

        return { ...ts, user_email: member?.email, user_name: member?.full_name, projectSummary }
      })
      setTeamTimesheets(enriched)
    }

    setLoading(false)
  }, [supabase, workspaceId, role, members, currentWeekStart])

  useEffect(() => { loadData() }, [loadData])

  const currentWeekTs = myTimesheets.find(
    ts => ts.week_start === format(currentWeekStart, 'yyyy-MM-dd')
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

  async function reviewTimesheet(id: string, status: 'approved' | 'rejected') {
    await supabase.from('timesheets').update({
      status, reviewer_note: reviewerNote || null, reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    setReviewingId(null); setReviewerNote(''); loadData()
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
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">{t('timesheetsTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {role === 'admin' ? t('timesheetsAdminSubtitle') : t('timesheetsSubtitle')}
        </p>
      </div>

      {role === 'admin' && (
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl mb-6 w-fit">
          {(['mine', 'team'] as const).map(tab => (
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

      {/* My timesheets tab */}
      {activeTab === 'mine' && (
        <div className="max-w-xl space-y-4">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentWeekStart(w => subWeeks(w, 1))} className="p-1 hover:bg-muted rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <div>
                  <p className="text-sm font-semibold text-foreground">{fmtRange(currentWeekStart)}</p>
                </div>
                <button
                  onClick={() => setCurrentWeekStart(w => addWeeks(w, 1))}
                  disabled={currentWeekStart >= startOfWeek(new Date(), { weekStartsOn: 1 })}
                  className="p-1 hover:bg-muted rounded-lg transition-colors disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              {currentWeekTs && <StatusBadge status={currentWeekTs.status} t={t} />}
            </div>

            <div className="bg-muted/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">
                {(weekTotalSec / 3600).toFixed(1)}h {t('weekHours')}
              </span>
            </div>

            {currentWeekTs?.status === 'rejected' && currentWeekTs.reviewer_note && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-red-500 mb-1">{t('reviewerNote')}:</p>
                <p className="text-xs text-red-400">{currentWeekTs.reviewer_note}</p>
              </div>
            )}

            {(!currentWeekTs || currentWeekTs.status === 'draft' || currentWeekTs.status === 'rejected') && (
              <div className="space-y-3">
                <div>
                  <label className="label">{t('weeklyNote')}</label>
                  <textarea className="input resize-none" rows={2} placeholder={t('weeklyNote')} value={note} onChange={e => setNote(e.target.value)} />
                </div>
                <button onClick={submitTimesheet} disabled={submitting || weekTotalSec === 0 || isProxying} className="btn-primary w-full disabled:opacity-40">
                  {submitting ? t('submitting') : t('submitForReview')}
                </button>
                {weekTotalSec === 0 && (
                  <p className="text-xs text-muted-foreground text-center">Track time this week before submitting.</p>
                )}
              </div>
            )}

            {currentWeekTs?.status === 'submitted' && (
              <div className="space-y-3">
                {currentWeekTs.note && <p className="text-xs text-muted-foreground italic">"{currentWeekTs.note}"</p>}
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
                      <StatusBadge status={ts.status} t={t} />
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

      {/* Admin review tab */}
      {activeTab === 'team' && role === 'admin' && (
        <div className="space-y-3">
          {teamTimesheets.length === 0 ? (
            <div className="card p-8 text-center">
              <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{t('noTimesheets')}</p>
            </div>
          ) : teamTimesheets.map(ts => {
            const isReviewing = reviewingId === ts.id
            const totalHours = (ts.projectSummary || []).reduce((s, p) => s + p.hours, 0)
            return (
              <div key={ts.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        {ts.user_name || ts.user_email || 'Unknown'}
                      </span>
                      <StatusBadge status={ts.status} t={t} />
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtRange(new Date(ts.week_start))}</p>

                    {/* Project summary */}
                    {ts.projectSummary && ts.projectSummary.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ts.projectSummary.map(p => (
                          <span key={p.name} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted/60 rounded-md text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{p.name}</span>
                            <span>{p.hours.toFixed(1)}h</span>
                          </span>
                        ))}
                        <span className="inline-flex items-center px-2 py-0.5 bg-brand-600/10 rounded-md text-xs font-semibold text-brand-600">
                          {totalHours.toFixed(1)}h {locale === 'de' ? 'gesamt' : 'total'}
                        </span>
                      </div>
                    )}

                    {ts.note && <p className="text-xs text-muted-foreground italic mt-1.5">"{ts.note}"</p>}
                  </div>
                  {ts.status === 'submitted' && !isReviewing && (
                    <button onClick={() => setReviewingId(ts.id)} className="btn-secondary text-xs py-1 px-2.5 flex-shrink-0">
                      Review
                    </button>
                  )}
                </div>

                {isReviewing && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <div>
                      <label className="label">{t('reviewerNote')}</label>
                      <textarea className="input resize-none" rows={2} value={reviewerNote} onChange={e => setReviewerNote(e.target.value)} placeholder="Optional feedback…" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => reviewTimesheet(ts.id, 'approved')} className="btn-primary flex items-center gap-1.5 flex-1">
                        <CheckCircle className="w-3.5 h-3.5" /> {t('approveTimesheet')}
                      </button>
                      <button onClick={() => reviewTimesheet(ts.id, 'rejected')} className="btn-secondary flex items-center gap-1.5 flex-1 text-red-500 border-red-500/20 hover:bg-red-500/10">
                        <XCircle className="w-3.5 h-3.5" /> {t('rejectTimesheet')}
                      </button>
                      <button onClick={() => setReviewingId(null)} className="btn-secondary px-3">{t('cancel')}</button>
                    </div>
                  </div>
                )}

                {ts.reviewer_note && !isReviewing && (
                  <p className="text-xs text-muted-foreground mt-1 italic border-t border-border pt-2">
                    Reviewer: "{ts.reviewer_note}"
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
