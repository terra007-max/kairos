'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend,
  isSameDay, getDate, subMonths, addMonths,
} from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plane, Sun, Umbrella, Plus, X, Lock } from 'lucide-react'
import KairosLoader from '@/components/KairosLoader'

type TimeOffEntry = {
  id: string
  user_id: string
  date: string
  type: 'vacation' | 'holiday' | 'sick'
  hours: number
}

const TYPE_CONFIG = {
  vacation: { labelKey: 'timeOffVacation', icon: Plane,    dot: 'bg-sky-500',   cell: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30' },
  holiday:  { labelKey: 'timeOffHoliday',  icon: Sun,      dot: 'bg-amber-500', cell: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' },
  sick:     { labelKey: 'timeOffSick',     icon: Umbrella, dot: 'bg-red-500',   cell: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30' },
} as const

export default function AbsencePage() {
  const supabase = createClient()
  const { workspaceId, role, members, isProjectManager } = useWorkspace()
  const { locale, t } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS
  const isAdmin = can(role, 'review:all')
  const canView = isAdmin || isProjectManager

  const [month, setMonth] = useState(() => new Date())
  const [entries, setEntries] = useState<TimeOffEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [addingFor, setAddingFor] = useState<{ userId: string; date: string } | null>(null)
  const [toDate, setToDate]       = useState('')
  const [newType, setNewType]     = useState<keyof typeof TYPE_CONFIG>('vacation')
  const [newHours, setNewHours]   = useState('8')
  const [saving, setSaving]       = useState(false)

  const activeMembers = members.filter(m => m.status === 'active' && m.user_id)

  const load = useCallback(async () => {
    if (!workspaceId) return
    const { data } = await supabase
      .from('time_off_entries')
      .select('id, user_id, date, type, hours')
      .eq('workspace_id', workspaceId)
      .gte('date', format(startOfMonth(month), 'yyyy-MM-dd'))
      .lte('date', format(endOfMonth(month), 'yyyy-MM-dd'))
    setEntries((data as TimeOffEntry[]) || [])
    setLoading(false)
  }, [supabase, workspaceId, month])

  useEffect(() => { load() }, [load])

  if (!canView) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Lock className="w-8 h-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{t('absenceAccessRestricted')}</p>
    </div>
  )

  if (loading) return <KairosLoader size="sm" />

  const today    = new Date()
  const workdays = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
    .filter(d => !isWeekend(d))

  function getEntry(userId: string, date: Date) {
    return entries.find(e => e.user_id === userId && e.date === format(date, 'yyyy-MM-dd'))
  }

  function openModal(userId: string, date: string) {
    setAddingFor({ userId, date })
    setToDate(date)
    setNewType('vacation')
    setNewHours('8')
  }

  async function removeEntry(id: string) {
    await supabase.from('time_off_entries').delete().eq('id', id)
    load()
  }

  async function addEntry() {
    if (!addingFor) return
    setSaving(true)
    const hours  = newType === 'holiday' ? 8 : (parseFloat(newHours) || 8)
    const from   = new Date(addingFor.date + 'T12:00:00')
    const to     = new Date((toDate || addingFor.date) + 'T12:00:00')
    const end    = to >= from ? to : from
    const days   = eachDayOfInterval({ start: from, end }).filter(d => !isWeekend(d))

    for (const day of days) {
      await supabase.from('time_off_entries').upsert({
        workspace_id: workspaceId,
        user_id: addingFor.userId,
        date: format(day, 'yyyy-MM-dd'),
        type: newType,
        hours,
      }, { onConflict: 'workspace_id,user_id,date' })
    }
    setSaving(false)
    setAddingFor(null)
    load()
  }

  const isHourly = (entry: TimeOffEntry) => entry.hours < 8

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('absenceCalendarTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('absenceCalendarSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(m => subMonths(m, 1))} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">
            {format(month, 'MMMM yyyy', { locale: dateFnsLocale })}
          </span>
          <button onClick={() => setMonth(m => addMonths(m, 1))} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={() => setMonth(new Date())} className="btn-secondary text-xs py-1 px-2.5 ml-1">
            {t('absenceToday')}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap">
        {(Object.entries(TYPE_CONFIG) as [keyof typeof TYPE_CONFIG, (typeof TYPE_CONFIG)[keyof typeof TYPE_CONFIG]][]).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className="text-xs text-muted-foreground">{t(cfg.labelKey as any)}</span>
          </div>
        ))}
        {/* Hourly legend */}
        <div className="flex items-center gap-1.5">
          <div className="relative w-4 h-4 flex items-center justify-center">
            <Plane className="w-2.5 h-2.5 text-muted-foreground/50" />
            <span className="absolute -bottom-0.5 -right-0.5 text-[6px] font-bold text-muted-foreground/70 leading-none">h</span>
          </div>
          <span className="text-xs text-muted-foreground">{t('absencePartialDay')}</span>
        </div>
        {isAdmin && (
          <span className="text-xs text-muted-foreground/50 ml-auto">{t('absenceHoverHint')}</span>
        )}
      </div>

      {/* Grid */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium sticky left-0 bg-muted/30 z-10 min-w-[150px]">
                  {t('member')}
                </th>
                {workdays.map(day => (
                  <th
                    key={day.toISOString()}
                    className={`py-3 text-center font-medium min-w-[34px] px-0.5 ${isSameDay(day, today) ? 'text-brand-600' : 'text-muted-foreground'}`}
                  >
                    <div className="text-[10px] leading-tight">
                      {format(day, 'EEE', { locale: dateFnsLocale }).slice(0, 2)}
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center mx-auto text-[11px] font-semibold leading-none mt-0.5 ${
                      isSameDay(day, today) ? 'bg-brand-600 text-white' : ''
                    }`}>
                      {getDate(day)}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-muted-foreground font-medium min-w-[56px]">
                  {t('absenceDays')}
                </th>
              </tr>
            </thead>
            <tbody>
              {activeMembers.map((m, i) => {
                const memberEntries = entries.filter(e => e.user_id === m.user_id)
                const totalDays = memberEntries.reduce((s, e) => s + e.hours, 0) / 8
                const isEven = i % 2 === 0

                return (
                  <tr key={m.user_id!} className={`border-b border-border last:border-0 ${isEven ? '' : 'bg-muted/20'}`}>
                    <td
                      className="px-4 py-2 sticky left-0 z-10"
                      style={{ background: isEven ? 'hsl(var(--card))' : 'hsl(var(--muted) / 0.2)' }}
                    >
                      <span className="font-medium text-foreground text-xs block truncate max-w-[130px]">
                        {m.full_name || m.email}
                      </span>
                    </td>

                    {workdays.map(day => {
                      const entry  = getEntry(m.user_id!, day)
                      const cfg    = entry ? TYPE_CONFIG[entry.type as keyof typeof TYPE_CONFIG] : null
                      const IconComp = cfg?.icon
                      const hourly = entry ? isHourly(entry) : false

                      return (
                        <td key={day.toISOString()} className="px-0.5 py-1 text-center">
                          {entry && cfg && IconComp ? (
                            <button
                              disabled={!isAdmin}
                              onClick={() => isAdmin && removeEntry(entry.id)}
                              title={`${t(cfg.labelKey as any)} · ${entry.hours}h${isAdmin ? ' · click to remove' : ''}`}
                              className={`w-[30px] h-[30px] rounded-md flex items-center justify-center mx-auto relative transition-opacity ${cfg.cell} ${isAdmin ? 'hover:opacity-60 cursor-pointer' : 'cursor-default'}`}
                            >
                              <IconComp className="w-3 h-3" />
                              {hourly && (
                                <span className="absolute bottom-[2px] right-[2px] text-[7px] font-bold leading-none opacity-80">
                                  {entry.hours}h
                                </span>
                              )}
                            </button>
                          ) : isAdmin ? (
                            <button
                              onClick={() => openModal(m.user_id!, format(day, 'yyyy-MM-dd'))}
                              className="w-[30px] h-[30px] rounded-md flex items-center justify-center mx-auto text-transparent hover:text-muted-foreground hover:bg-muted/60 transition-all"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          ) : (
                            <div className="w-[30px] h-[30px]" />
                          )}
                        </td>
                      )
                    })}

                    <td className="px-4 py-2 text-right">
                      {totalDays > 0 ? (
                        <span className="font-semibold text-foreground">
                          {totalDays % 1 === 0 ? totalDays : totalDays.toFixed(1)}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
      {addingFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setAddingFor(null)}
        >
          <div className="card p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">{t('absenceAddTimeOff')}</h3>
              <button onClick={() => setAddingFor(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-medium text-foreground mb-4">
              {activeMembers.find(mem => mem.user_id === addingFor.userId)?.full_name
                || activeMembers.find(mem => mem.user_id === addingFor.userId)?.email
                || 'Member'}
            </p>

            <div className="space-y-3">
              {/* Type */}
              <div>
                <label className="label text-xs">{t('absenceType')}</label>
                <select
                  className="input text-sm"
                  value={newType}
                  onChange={e => {
                    const v = e.target.value as keyof typeof TYPE_CONFIG
                    setNewType(v)
                    if (v === 'holiday') setNewHours('8')
                  }}
                >
                  <option value="vacation">{t('timeOffVacation')}</option>
                  <option value="holiday">{t('timeOffHoliday')}</option>
                  <option value="sick">{t('timeOffSick')}</option>
                </select>
              </div>

              {/* Date range — hidden for holiday (single day, set by cell click) */}
              {newType !== 'holiday' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">{t('absenceFromDate')}</label>
                    <input
                      type="date" className="input text-sm"
                      value={addingFor.date}
                      onChange={e => setAddingFor({ ...addingFor, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">{t('absenceToDate')}</label>
                    <input
                      type="date" className="input text-sm"
                      value={toDate}
                      min={addingFor.date}
                      onChange={e => setToDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {newType === 'holiday' && (
                <div>
                  <label className="label text-xs">{t('absenceDate')}</label>
                  <input
                    type="date" className="input text-sm"
                    value={addingFor.date}
                    onChange={e => setAddingFor({ ...addingFor, date: e.target.value })}
                  />
                </div>
              )}

              {/* Hours — hidden for holiday */}
              {newType !== 'holiday' && (
                <div>
                  <label className="label text-xs flex items-center justify-between">
                    <span>{t('hours')}</span>
                    <span className="text-muted-foreground/60 font-normal">
                      {parseFloat(newHours) >= 8
                        ? t('absenceFullDay')
                        : `${t('absencePartialDay')} (${newHours}h)`}
                    </span>
                  </label>
                  {/* Quick select buttons */}
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {['1', '2', '3', '4', '6', '8'].map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setNewHours(h)}
                        className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                          newHours === h
                            ? 'bg-brand-600 border-brand-600 text-white'
                            : 'border-border text-muted-foreground hover:border-brand-600/40 hover:text-foreground'
                        }`}
                      >
                        {h === '8' ? `8h (${t('absenceFullDay')})` : `${h}h`}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" className="input text-sm"
                    value={newHours} min="0.5" max="24" step="0.5"
                    onChange={e => setNewHours(e.target.value)}
                  />
                </div>
              )}

              <button onClick={addEntry} disabled={saving} className="btn-primary w-full">
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
