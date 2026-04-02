'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { endOfWeek, format, getISOWeek } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { CheckCircle, XCircle, ClipboardList, Unlock } from 'lucide-react'
import { type Timesheet } from '../_lib/types'
import { StatusBadge } from './StatusBadge'

type TeamTimesheet = Timesheet & { user_email?: string; user_name?: string }

export function TeamReviewTab({
  teamTimesheets,
  workspaceId,
  onReload,
}: {
  teamTimesheets: TeamTimesheet[]
  workspaceId: string
  onReload: () => void
}) {
  const supabase = createClient()
  const { role, managedProjectIds, isProjectManager } = useWorkspace()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS

  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewerNote, setReviewerNote] = useState('')

  function fmtRange(start: Date) {
    const end = endOfWeek(start, { weekStartsOn: 1 })
    const kw  = getISOWeek(start)
    const cwLabel = locale === 'de' ? 'KW' : 'CW'
    return `${cwLabel} ${kw} · ${format(start, 'd. MMM', { locale: dateFnsLocale })} – ${format(end, 'd. MMM yyyy', { locale: dateFnsLocale })}`
  }

  async function reviewTimesheet(id: string, status: 'approved' | 'rejected', projectId?: string) {
    await fetch('/api/timesheets/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timesheetId: id, status, reviewerNote: reviewerNote || null, workspaceId, projectId }),
    })
    setReviewingId(null); setReviewerNote(''); onReload()
  }

  async function unlockTimesheet(id: string) {
    await supabase.from('timesheets').update({ locked: false, locked_at: null, locked_by: null }).eq('id', id)
    onReload()
  }

  if (teamTimesheets.length === 0) return (
    <div className="card p-8 text-center">
      <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">{t('noTimesheets')}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {teamTimesheets.map(ts => {
        const isReviewing  = reviewingId === ts.id
        const totalHours   = (ts.projectSummary || []).reduce((s, p) => s + p.hours, 0)

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

              <div className="flex items-center gap-2 shrink-0">
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
                  <button onClick={() => setReviewingId(ts.id)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5">
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

                {!can(role, 'review:all') && isProjectManager && ts.projectSummary && ts.projectSummary.length > 0 ? (
                  <div className="space-y-2">
                    {ts.projectSummary.map(p => {
                      if (!managedProjectIds.includes(p.id)) return null
                      const approval = ts.project_approvals?.[p.id]
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
  )
}
