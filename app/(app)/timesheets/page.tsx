'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { formatDuration } from '@/lib/types'
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns'
import { CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, ClipboardList, AlertCircle } from 'lucide-react'

type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

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
  const { workspaceId, role, members } = useWorkspace()
  const { t } = useI18n()

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

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    // Load week's time entries for total
    const { data: entries } = await supabase
      .from('time_entries')
      .select('duration_sec')
      .eq('user_id', user.id)
      .not('end_time', 'is', null)
      .gte('start_time', currentWeekStart.toISOString())
      .lte('start_time', weekEnd.toISOString())
    setWeekTotalSec((entries || []).reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))

    // Load timesheets
    const { data: myTs, error } = await supabase
      .from('timesheets')
      .select('*')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .order('week_start', { ascending: false })

    if (error?.code === '42P01') { // table does not exist
      setDbError(true)
      setLoading(false)
      return
    }
    setMyTimesheets(myTs || [])

    // Admin: load all team timesheets
    if (role === 'admin') {
      const { data: teamTs } = await supabase
        .from('timesheets')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('week_start', { ascending: false })
        .limit(50)

      const enriched = (teamTs || []).map(ts => {
        const member = members.find(m => m.user_id === ts.user_id)
        return { ...ts, user_email: member?.email, user_name: member?.full_name }
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
        status: 'submitted',
        note: note || null,
        submitted_at: new Date().toISOString(),
      }).eq('id', currentWeekTs.id)
    } else {
      await supabase.from('timesheets').insert({
        user_id: userId,
        workspace_id: workspaceId,
        week_start: weekStartStr,
        status: 'submitted',
        note: note || null,
        submitted_at: new Date().toISOString(),
      })
    }
    setNote('')
    setSubmitting(false)
    loadData()
  }

  async function withdrawTimesheet() {
    if (!currentWeekTs) return
    await supabase.from('timesheets').update({ status: 'draft', submitted_at: null }).eq('id', currentWeekTs.id)
    loadData()
  }

  async function reviewTimesheet(id: string, status: 'approved' | 'rejected') {
    await supabase.from('timesheets').update({
      status,
      reviewer_note: reviewerNote || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    setReviewingId(null)
    setReviewerNote('')
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
            The <code className="bg-muted px-1 rounded">timesheets</code> table does not exist yet. Run the migration SQL in your Supabase dashboard to enable this feature.
          </p>
          <p className="text-xs text-muted-foreground">Go to: <strong>Supabase Dashboard → SQL Editor</strong> and run the migration from <code className="bg-muted px-1 rounded">supabase/schema.sql</code></p>
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

      {/* Tabs (admin only) */}
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
          {/* Current week */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentWeekStart(w => subWeeks(w, 1))} className="p-1 hover:bg-muted rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {format(currentWeekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('weekOf')} {format(currentWeekStart, 'MMMM d')}</p>
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

            {/* Hours tracked */}
            <div className="bg-muted/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">
                {(weekTotalSec / 3600).toFixed(1)}h {t('weekHours')}
              </span>
            </div>

            {/* Reviewer note (if rejected) */}
            {currentWeekTs?.status === 'rejected' && currentWeekTs.reviewer_note && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-red-500 mb-1">{t('reviewerNote')}:</p>
                <p className="text-xs text-red-400">{currentWeekTs.reviewer_note}</p>
              </div>
            )}

            {/* Submit form */}
            {(!currentWeekTs || currentWeekTs.status === 'draft' || currentWeekTs.status === 'rejected') && (
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
                  disabled={submitting || weekTotalSec === 0}
                  className="btn-primary w-full"
                >
                  {submitting ? t('submitting') : t('submitForReview')}
                </button>
                {weekTotalSec === 0 && (
                  <p className="text-xs text-muted-foreground text-center">Track time this week before submitting.</p>
                )}
              </div>
            )}

            {currentWeekTs?.status === 'submitted' && (
              <div className="space-y-3">
                {currentWeekTs.note && (
                  <p className="text-xs text-muted-foreground italic">"{currentWeekTs.note}"</p>
                )}
                <button onClick={withdrawTimesheet} className="btn-secondary w-full text-sm">
                  {t('withdrawSubmission')}
                </button>
              </div>
            )}

            {currentWeekTs?.status === 'approved' && (
              <div className="text-center py-2">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{t('timesheetApproved')}</p>
                {currentWeekTs.note && <p className="text-xs text-muted-foreground mt-1 italic">"{currentWeekTs.note}"</p>}
              </div>
            )}
          </div>

          {/* History */}
          {myTimesheets.filter(ts => ts.week_start !== format(currentWeekStart, 'yyyy-MM-dd')).length > 0 && (
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('previousWeeks')}</h2>
              <div className="space-y-2">
                {myTimesheets
                  .filter(ts => ts.week_start !== format(currentWeekStart, 'yyyy-MM-dd'))
                  .map(ts => {
                    const wsDate = new Date(ts.week_start)
                    return (
                      <div key={ts.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {format(wsDate, 'MMM d')} – {format(endOfWeek(wsDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}
                          </p>
                          {ts.note && <p className="text-xs text-muted-foreground italic mt-0.5">"{ts.note}"</p>}
                        </div>
                        <StatusBadge status={ts.status} t={t} />
                      </div>
                    )
                  })}
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
            const wsDate = new Date(ts.week_start)
            const isReviewing = reviewingId === ts.id
            return (
              <div key={ts.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        {ts.user_name || ts.user_email || 'Unknown'}
                      </span>
                      <StatusBadge status={ts.status} t={t} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(wsDate, 'MMM d')} – {format(endOfWeek(wsDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}
                    </p>
                    {ts.note && <p className="text-xs text-muted-foreground italic mt-1">"{ts.note}"</p>}
                  </div>
                  {ts.status === 'submitted' && !isReviewing && (
                    <button
                      onClick={() => setReviewingId(ts.id)}
                      className="btn-secondary text-xs py-1 px-2.5 flex-shrink-0"
                    >
                      Review
                    </button>
                  )}
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
                        placeholder="Optional feedback…"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => reviewTimesheet(ts.id, 'approved')}
                        className="btn-primary flex items-center gap-1.5 flex-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> {t('approveTimesheet')}
                      </button>
                      <button
                        onClick={() => reviewTimesheet(ts.id, 'rejected')}
                        className="btn-secondary flex items-center gap-1.5 flex-1 text-red-500 border-red-500/20 hover:bg-red-500/10"
                      >
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
