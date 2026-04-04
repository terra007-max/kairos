'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import KairosLoader from '@/components/KairosLoader'
import { type Timesheet, type TimeOffEntry, isDeadlinePassed } from './_lib/types'
import { MyTimesheetTab } from './_components/MyTimesheetTab'
import { TeamReviewTab } from './_components/TeamReviewTab'

export default function TimesheetsPage() {
  const supabase = createClient()
  const { workspaceId, role, members, effectiveUserId, managedProjectIds, isProjectManager, isProxying } = useWorkspace()
  const { t } = useI18n()

  const [userId, setUserId] = useState('')
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [myTimesheets, setMyTimesheets] = useState<Timesheet[]>([])
  const [teamTimesheets, setTeamTimesheets] = useState<(Timesheet & { user_email?: string; user_name?: string })[]>([])
  const [weekTotalSec, setWeekTotalSec] = useState(0)
  const [timeOffEntries, setTimeOffEntries] = useState<TimeOffEntry[]>([])
  const [weekProjectPMs, setWeekProjectPMs] = useState<{ projectName: string; pmName: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)
  const [membersNoTime, setMembersNoTime] = useState<{ name: string; noBillable: boolean }[]>([])

  const canReview = can(role, 'review:all') || isProjectManager
  const [activeTab, setActiveTab] = useState<'mine' | 'team'>(canReview ? 'team' : 'mine')

  const autoLockPastWeeks = useCallback(async (sheets: Timesheet[], uid: string) => {
    // Lock past-deadline drafts AND submitted timesheets — submitted weeks past the
    // deadline should also be locked so the member cannot withdraw and re-edit them
    const toUpdate = sheets
      .filter(ts => !ts.locked && (ts.status === 'draft' || ts.status === 'submitted') && isDeadlinePassed(new Date(ts.week_start)))
      .map(ts => ts.id)
    if (toUpdate.length === 0) return sheets
    await supabase.from('timesheets')
      .update({ locked: true, locked_at: new Date().toISOString(), locked_by: uid })
      .in('id', toUpdate)
    return sheets.map(ts => toUpdate.includes(ts.id) ? { ...ts, locked: true } : ts)
  }, [supabase])

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    const uid = effectiveUserId
    setUserId(uid)
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })

    if (can(role, 'record:time') || isProxying) {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('duration_sec, project_id, project:projects(name, manager_id)')
        .eq('user_id', uid)
        .not('end_time', 'is', null)
        .gte('start_time', currentWeekStart.toISOString())
        .lte('start_time', weekEnd.toISOString())
      setWeekTotalSec((entries || []).reduce((s: number, e: { duration_sec?: number }) => s + (e.duration_sec || 0), 0))

      const seen = new Set<string>()
      const pms: { projectName: string; pmName: string }[] = []
      for (const e of entries || []) {
        const p = (e as unknown as { project?: { name: string; manager_id: string | null } | null; project_id: string }).project
        const eTyped = e as { project_id: string }
        if (!p || !p.manager_id || seen.has(eTyped.project_id)) continue
        seen.add(eTyped.project_id)
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

      const lockedTs = await autoLockPastWeeks(myTs || [], uid)
      setMyTimesheets(lockedTs)

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
        const { data: entryRows } = await supabase
          .from('time_entries')
          .select('user_id')
          .in('project_id', managedProjectIds)
          .eq('workspace_id', workspaceId)
        pmUserIds = Array.from(new Set((entryRows || []).map((r: { user_id: string }) => r.user_id)))
        if (pmUserIds.length === 0) {
          const { data: pmRows } = await supabase
            .from('project_members').select('user_id').in('project_id', managedProjectIds)
          pmUserIds = Array.from(new Set((pmRows || []).map((r: { user_id: string }) => r.user_id)))
        }
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
          if (!pmUserIds) return true
          const weekStart   = new Date(ts.week_start)
          const weekEndDate = endOfWeek(weekStart, { weekStartsOn: 1 })
          return (allEntries || []).some((e: { user_id: string; project_id: string; start_time: string }) =>
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
          const tsEntries = (allEntries || []).filter((e: { user_id: string; start_time: string }) => {
            if (e.user_id !== ts.user_id) return false
            const d = new Date(e.start_time)
            return d >= weekStart && d <= weekEndDate
          })
          const projectMap: Record<string, { name: string; secs: number; managerId: string | null }> = {}
          for (const e of tsEntries) {
            const eTyped = e as unknown as { project_id: string; project?: { name: string; manager_id: string | null } | null; duration_sec?: number }
            if (!eTyped.project_id) continue
            const name = eTyped.project?.name || eTyped.project_id
            const managerId = eTyped.project?.manager_id || null
            if (!projectMap[eTyped.project_id]) projectMap[eTyped.project_id] = { name, secs: 0, managerId }
            projectMap[eTyped.project_id].secs += eTyped.duration_sec || 0
          }
          const projectSummary = Object.entries(projectMap)
            .map(([id, p]) => ({ id, name: p.name, hours: p.secs / 3600, managerId: p.managerId }))
            .sort((a, b) => b.hours - a.hours)
          return { ...ts, user_email: member?.email, user_name: member?.full_name, projectSummary }
        })
      setTeamTimesheets(enriched)

      // Compute which active members have no time this week
      if (can(role, 'review:all')) {
        const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
        const activeM = members.filter(m => m.status === 'active' && m.user_id && m.weekly_hours && m.weekly_hours > 0)
        const noTime = activeM.map(m => {
          const weekEntries = (allEntries || []).filter((e: { user_id: string; start_time: string }) =>
            e.user_id === m.user_id && new Date(e.start_time) >= thisWeekStart
          )
          const total = weekEntries.reduce((s: number, e: { duration_sec?: number }) => s + (e.duration_sec || 0), 0)
          const billable = (weekEntries as any[]).filter(e => e.billable).reduce((s: number, e: { duration_sec?: number }) => s + (e.duration_sec || 0), 0)
          if (total === 0) return { name: m.full_name || m.email || '', noBillable: false }
          if (billable === 0) return { name: m.full_name || m.email || '', noBillable: true }
          return null
        }).filter(Boolean) as { name: string; noBillable: boolean }[]
        setMembersNoTime(noTime)
      }
    }
    setLoading(false)
  }, [supabase, workspaceId, role, members, currentWeekStart, isProjectManager, managedProjectIds, autoLockPastWeeks, canReview, effectiveUserId])

  useEffect(() => { loadData() }, [loadData])

  if (loading) return <KairosLoader size="sm" />

  if (dbError) return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{t('timesheetsTitle')}</h1>
      </div>
      <div className="card p-6 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
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

      {activeTab === 'mine' && (
        <MyTimesheetTab
          myTimesheets={myTimesheets}
          currentWeekStart={currentWeekStart}
          weekTotalSec={weekTotalSec}
          timeOffEntries={timeOffEntries}
          weekProjectPMs={weekProjectPMs}
          userId={userId}
          onWeekChange={setCurrentWeekStart}
          onReload={loadData}
        />
      )}

      {activeTab === 'team' && canReview && (
        <>
          {membersNoTime.length > 0 && (
            <div className="space-y-2 mb-4">
              {membersNoTime.map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    <span className="font-semibold">{m.name}</span>
                    {' — '}
                    {m.noBillable ? t('noBillableWeek') : t('noTimeTrackedWeek')}
                  </p>
                </div>
              ))}
            </div>
          )}
          <TeamReviewTab
            teamTimesheets={teamTimesheets}
            workspaceId={workspaceId}
            onReload={loadData}
          />
        </>
      )}
    </div>
  )
}
