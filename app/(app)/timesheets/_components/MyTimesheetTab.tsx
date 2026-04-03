'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import {
  format, startOfWeek, endOfWeek, subWeeks, addWeeks, getISOWeek,
  isFriday, isSaturday, isSunday,
} from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { ClipboardList, Clock, ChevronLeft, ChevronRight, Lock, Unlock, Plane, Sun, Umbrella } from 'lucide-react'
import { type Timesheet, type TimeOffEntry, isDeadlinePassed } from '../_lib/types'
import { StatusBadge } from './StatusBadge'

const TIME_OFF_ICONS: Record<string, typeof Umbrella> = {
  vacation: Plane,
  holiday:  Sun,
  sick:     Umbrella,
}

export function MyTimesheetTab({
  myTimesheets,
  currentWeekStart,
  weekTotalSec,
  timeOffEntries,
  weekProjectPMs,
  userId,
  onWeekChange,
  onReload,
}: {
  myTimesheets: Timesheet[]
  currentWeekStart: Date
  weekTotalSec: number
  timeOffEntries: TimeOffEntry[]
  weekProjectPMs: { projectName: string; pmName: string }[]
  userId: string
  onWeekChange: (next: Date) => void
  onReload: () => void
}) {
  const supabase = createClient()
  const { workspaceId, role, isProxying, effectiveUserId } = useWorkspace()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS
  const canReview = can(role, 'review:all')

  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [addingTimeOff, setAddingTimeOff] = useState(false)
  const [newToDate, setNewToDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [newToType, setNewToType] = useState<'vacation' | 'holiday' | 'sick'>('vacation')
  const [newToHours, setNewToHours] = useState('8')

  const currentWeekTs = myTimesheets.find(
    ts => ts.week_start === format(currentWeekStart, 'yyyy-MM-dd')
  )

  const viewedWeekIsLocked = useMemo(() => {
    if (currentWeekTs?.locked) return true
    if (!currentWeekTs && isDeadlinePassed(currentWeekStart)) return true
    return false
  }, [currentWeekTs, currentWeekStart])

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

  const timeOffThisWeek = timeOffEntries.reduce((s, e) => s + e.hours, 0)

  function fmtRange(start: Date) {
    const end = endOfWeek(start, { weekStartsOn: 1 })
    const kw  = getISOWeek(start)
    const cwLabel = locale === 'de' ? 'KW' : 'CW'
    return `${cwLabel} ${kw} · ${format(start, 'd. MMM', { locale: dateFnsLocale })} – ${format(end, 'd. MMM yyyy', { locale: dateFnsLocale })}`
  }

  async function submitTimesheet() {
    setSubmitting(true)
    const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd')
    await fetch('/api/timesheets/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        weekStart: weekStartStr,
        note: note || null,
        action: 'submit',
        timesheetId: currentWeekTs?.id,
        proxyUserId: isProxying ? effectiveUserId : undefined,
      }),
    })
    setNote(''); setSubmitting(false); onReload()
  }

  async function withdrawTimesheet() {
    if (!currentWeekTs) return
    await fetch('/api/timesheets/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        action: 'withdraw',
        timesheetId: currentWeekTs.id,
        proxyUserId: isProxying ? effectiveUserId : undefined,
      }),
    })
    onReload()
  }

  async function unlockCurrent() {
    if (!currentWeekTs) return
    await supabase.from('timesheets').update({ locked: false, locked_at: null, locked_by: null }).eq('id', currentWeekTs.id)
    onReload()
  }

  async function addTimeOff() {
    const hours = parseFloat(newToHours)
    if (!hours || hours <= 0) return
    await supabase.from('time_off_entries').upsert({
      workspace_id: workspaceId,
      user_id: userId,
      date: newToDate,
      type: newToType,
      hours,
    }, { onConflict: 'workspace_id,user_id,date' })
    setAddingTimeOff(false)
    setNewToDate(format(currentWeekStart, 'yyyy-MM-dd'))
    onReload()
  }

  async function removeTimeOff(id: string) {
    await supabase.from('time_off_entries').delete().eq('id', id)
    onReload()
  }

  return (
    <div className="max-w-xl space-y-4">
      {showDeadlineReminder && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
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
              onClick={() => onWeekChange(subWeeks(currentWeekStart, 1))}
              className="p-1 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <p className="text-sm font-semibold text-foreground">{fmtRange(currentWeekStart)}</p>
            <button
              onClick={() => onWeekChange(addWeeks(currentWeekStart, 1))}
              className="p-1 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <StatusBadge status={currentWeekTs?.status || 'draft'} locked={viewedWeekIsLocked} t={t} />
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
              <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
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
                onClick={unlockCurrent}
                className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 text-sky-600 border-sky-500/20 hover:bg-sky-500/10 shrink-0"
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

        {/* Submit form */}
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
              disabled={submitting || weekTotalSec === 0}
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

      {/* Time Off section */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('timeOffTitle')}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t('timeOffSubtitle')}</p>
          </div>
          {!addingTimeOff && (
            <button
              onClick={() => { setAddingTimeOff(true); setNewToDate(format(currentWeekStart, 'yyyy-MM-dd')) }}
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
                  onChange={e => setNewToType(e.target.value as typeof newToType)}
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

      {/* Previous weeks */}
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
  )
}
