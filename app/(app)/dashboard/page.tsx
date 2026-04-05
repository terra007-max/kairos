'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { formatDuration, formatMoney } from '@/lib/types'
import {
  Clock, Briefcase, ArrowUpRight, ArrowDownRight, Minus,
  AlertTriangle, ChevronRight, Play,
} from 'lucide-react'
import {
  startOfWeek, startOfMonth, subWeeks, subMonths,
  formatDistanceToNow, isBefore, parseISO,
} from 'date-fns'
import { de, enGB } from 'date-fns/locale'
import Link from 'next/link'

// ─── helpers ──────────────────────────────────────────────────────────────────

function countWeekdays(from: Date, to: Date): number {
  let count = 0
  const d = new Date(from); d.setHours(0, 0, 0, 0)
  const end = new Date(to); end.setHours(23, 59, 59, 999)
  while (d <= end) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const { t } = useI18n()
  if (previous === 0 && current === 0) return <span className="trend-neutral"><Minus className="w-3 h-3" />—</span>
  if (previous === 0) return <span className="trend-up"><ArrowUpRight className="w-3 h-3" />{t('trendNew')}</span>
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct > 0) return <span className="trend-up"><ArrowUpRight className="w-3 h-3" />+{pct}%</span>
  if (pct < 0) return <span className="trend-down"><ArrowDownRight className="w-3 h-3" />{pct}%</span>
  return <span className="trend-neutral"><Minus className="w-3 h-3" />0%</span>
}

function SkeletonCard() {
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-muted animate-pulse" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-5 w-12 rounded-full" />
        </div>
        <div className="skeleton h-8 w-28" />
        <div className="skeleton h-1 w-full rounded-full" />
        <div className="skeleton h-3 w-24" />
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, accent, bar, barClass, trend }: {
  label: string; value: string; sub?: string
  accent: string; bar?: number; barClass?: string; trend?: React.ReactNode
}) {
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
        {trend}
      </div>
      <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
      {bar !== undefined && barClass && (
        <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${Math.min(bar, 100)}%` }} />
        </div>
      )}
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

type ProjectHealthRow = {
  id: string; name: string; color: string; clientName: string
  budgetPct: number; trackedDisplay: string; budgetDisplay: string
}

export default function DashboardPage() {
  const supabase = createClient()
  const { workspaceId, role, members, effectiveUserId } = useWorkspace()
  const { t, locale } = useI18n()
  const dateLocale = locale === 'de' ? de : enGB

  const isTeamViewer  = can(role, 'review:all')
  const isPM          = can(role, 'review:managed')
  const canInvoices   = can(role, 'manage:invoices')
  const seesTeam      = isTeamViewer || isPM

  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState('')

  // time KPIs
  const [weekSecs, setWeekSecs]           = useState(0)
  const [monthSecs, setMonthSecs]         = useState(0)
  const [prevWeekSecs, setPrevWeekSecs]   = useState(0)
  const [prevMonthSecs, setPrevMonthSecs] = useState(0)
  const [earnings, setEarnings]           = useState(0)
  const [prevEarnings, setPrevEarnings]   = useState(0)
  const [monthBillSecs, setMonthBillSecs] = useState(0)
  const [prevWeekBillSecs, setPrevWeekBillSecs] = useState(0)

  // invoice KPIs
  const [outstanding, setOutstanding] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)

  // project health
  const [projectHealth, setProjectHealth] = useState<ProjectHealthRow[]>([])
  const [activeProjectCount, setActiveProjectCount] = useState(0)

  // recent entries
  const [recent, setRecent] = useState<any[]>([])

  const now = new Date()
  const hour = now.getHours()
  const greetKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening'

  const todayFormatted = now.toLocaleDateString(
    locale === 'de' ? 'de-AT' : 'en-GB',
    { weekday: 'long', month: 'long', day: 'numeric' },
  )

  const load = useCallback(async () => {
    if (!workspaceId) return
    const n   = new Date()
    const wkS = startOfWeek(n, { weekStartsOn: 1 })
    const moS = startOfMonth(n)
    const pWkS = subWeeks(wkS, 1)
    const pWkE = new Date(wkS.getTime() - 1)
    const pMoS = startOfMonth(subMonths(n, 1))
    const pMoE = new Date(moS.getTime() - 1)

    const uf = seesTeam ? {} : { user_id: effectiveUserId }

    const base: Promise<any>[] = [
      supabase.from('time_entries').select('duration_sec,billable,hourly_rate').eq('workspace_id', workspaceId).match(uf).gte('start_time', wkS.toISOString()).not('end_time', 'is', null),
      supabase.from('time_entries').select('duration_sec,billable,hourly_rate').eq('workspace_id', workspaceId).match(uf).gte('start_time', moS.toISOString()).not('end_time', 'is', null),
      supabase.from('time_entries').select('duration_sec,billable').eq('workspace_id', workspaceId).match(uf).gte('start_time', pWkS.toISOString()).lte('start_time', pWkE.toISOString()).not('end_time', 'is', null),
      supabase.from('time_entries').select('duration_sec,billable,hourly_rate').eq('workspace_id', workspaceId).match(uf).gte('start_time', pMoS.toISOString()).lte('start_time', pMoE.toISOString()).not('end_time', 'is', null),
      supabase.from('time_entries').select('*,project:projects(*,client:clients(*))').eq('workspace_id', workspaceId).match(uf).order('start_time', { ascending: false }).limit(8),
      supabase.auth.getUser(),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'active').is('deleted_at', null),
    ]
    if (canInvoices) base.push(
      supabase.from('invoices').select('total,due_date,status').eq('workspace_id', workspaceId)
    )
    if (isTeamViewer) base.push(
      supabase.from('projects').select('id,name,color,budget_hours,budget_amount,client:clients(name)').eq('workspace_id', workspaceId).eq('status', 'active').is('deleted_at', null),
      supabase.from('time_entries').select('project_id,duration_sec,billable,hourly_rate').eq('workspace_id', workspaceId).not('end_time', 'is', null),
    )

    const res = await Promise.all(base)
    let i = 0
    const week     = res[i++]?.data ?? []
    const month    = res[i++]?.data ?? []
    const prevWeek = res[i++]?.data ?? []
    const prevMonth = res[i++]?.data ?? []
    const recentData = res[i++]?.data ?? []
    const { data: { user } } = res[i++]
    const projCount = res[i++]?.count ?? 0
    const invoicesData = canInvoices ? (res[i++]?.data ?? []) : []
    const projects   = isTeamViewer ? (res[i++]?.data ?? []) : []
    const allEntries = isTeamViewer ? (res[i++]?.data ?? []) : []

    if (user) {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setFirstName(prof?.full_name?.split(' ')[0] ?? '')
    }

    const earn = (es: any[]) => es.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600 * (e.hourly_rate || 0), 0)

    setWeekSecs(week.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))
    setMonthSecs(month.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))
    setPrevWeekSecs(prevWeek.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))
    setPrevMonthSecs(prevMonth.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))
    setEarnings(earn(month))
    setPrevEarnings(earn(prevMonth))
    setMonthBillSecs(month.filter((e: any) => e.billable).reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))
    setPrevWeekBillSecs(prevWeek.filter((e: any) => e.billable).reduce((s: number, e: any) => s + (e.duration_sec || 0), 0))
    setRecent(recentData)
    setActiveProjectCount(isTeamViewer ? projects.length : projCount)

    if (canInvoices) {
      const sent = invoicesData.filter((inv: any) => inv.status === 'sent')
      setOutstanding(sent.reduce((s: number, inv: any) => s + (inv.total || 0), 0))
      setOverdueCount(sent.filter((inv: any) => inv.due_date && isBefore(parseISO(inv.due_date), new Date())).length)
    }

    if (isTeamViewer) {
      const em: Record<string, { secs: number; earn: number }> = {}
      for (const e of allEntries) {
        if (!e.project_id) continue
        if (!em[e.project_id]) em[e.project_id] = { secs: 0, earn: 0 }
        em[e.project_id].secs += e.duration_sec || 0
        if (e.billable) em[e.project_id].earn += (e.duration_sec || 0) / 3600 * (e.hourly_rate || 0)
      }
      const rows: ProjectHealthRow[] = projects
        .map((p: any) => {
          const trackedH = (em[p.id]?.secs || 0) / 3600
          const trackedE = em[p.id]?.earn || 0
          if (p.budget_hours) {
            return { id: p.id, name: p.name, color: p.color || '#6366f1', clientName: p.client?.name || '', budgetPct: Math.min(trackedH / p.budget_hours * 100, 999), trackedDisplay: `${trackedH.toFixed(1)}h`, budgetDisplay: `${p.budget_hours}h` }
          }
          if (p.budget_amount) {
            return { id: p.id, name: p.name, color: p.color || '#6366f1', clientName: p.client?.name || '', budgetPct: Math.min(trackedE / p.budget_amount * 100, 999), trackedDisplay: formatMoney(trackedE), budgetDisplay: formatMoney(p.budget_amount) }
          }
          return null
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.budgetPct - a.budgetPct) as ProjectHealthRow[]
      setProjectHealth(rows)
    }

    setLoading(false)
  }, [supabase, workspaceId, role, members, effectiveUserId, canInvoices, isTeamViewer, seesTeam])

  useEffect(() => { load() }, [load])

  // ── utilization ────────────────────────────────────────────────────────────
  const activeMembers = members.filter(m => m.status === 'active')
  const myMember = members.find(m => m.user_id === effectiveUserId)
  const totalWeeklyH = seesTeam
    ? activeMembers.reduce((s, m) => s + (m.weekly_hours ?? 40), 0)
    : (myMember?.weekly_hours ?? 40)

  const moStart  = startOfMonth(now)
  const moWorkdays = Math.max(countWeekdays(moStart, now), 1)
  const monthCapH  = totalWeeklyH * (moWorkdays / 5)
  const monthBillH = monthBillSecs / 3600
  const monthUtil  = monthCapH > 0 ? Math.round(monthBillH / monthCapH * 100) : 0

  const prevWeekBillH = prevWeekBillSecs / 3600
  const prevWeekUtil  = totalWeeklyH > 0 ? Math.round(prevWeekBillH / totalWeeklyH * 100) : 0

  const utilBarClass = monthUtil >= 90 ? 'bg-emerald-500' : monthUtil >= 60 ? 'bg-amber-500' : 'bg-muted-foreground/40'

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {t(greetKey)}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{todayFormatted}</p>
        </div>
        {can(role, 'record:time') && (
          <Link href="/timer" className="btn-primary inline-flex items-center gap-1.5 text-sm">
            <Play className="w-3.5 h-3.5" />
            {t('startTracking')}
          </Link>
        )}
      </div>

      {/* ── Overdue alert ──────────────────────────────────────────────────── */}
      {!loading && overdueCount > 0 && (
        <Link href="/invoices" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-colors group">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400 flex-1">
            <span className="font-semibold">{overdueCount} {t('overdueAlertSuffix')}</span>
            {' — '}{t('overdueAlertBody')}
          </p>
          <ChevronRight className="w-4 h-4 text-red-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : isTeamViewer ? (
          /* Partner / Admin view */
          <>
            <KpiCard
              label={t('monthlyEarnings')}
              value={formatMoney(earnings)}
              sub={t('billableOnly')}
              accent="bg-gradient-to-r from-emerald-500 to-teal-400"
              bar={prevEarnings > 0 ? Math.min(earnings / Math.max(earnings, prevEarnings) * 100, 100) : 60}
              barClass="bg-emerald-500"
              trend={<TrendBadge current={earnings} previous={prevEarnings} />}
            />
            <KpiCard
              label={t('outstandingInvoices')}
              value={formatMoney(outstanding)}
              sub={`${overdueCount > 0 ? `${overdueCount} ${t('overdueLabel')} · ` : ''}${t('sentUnpaid')}`}
              accent={overdueCount > 0 ? 'bg-gradient-to-r from-red-500 to-orange-400' : 'bg-gradient-to-r from-amber-500 to-yellow-400'}
              bar={60}
              barClass={overdueCount > 0 ? 'bg-red-500' : 'bg-amber-400'}
              trend={overdueCount > 0 ? <span className="trend-down"><AlertTriangle className="w-3 h-3" />{overdueCount}</span> : undefined}
            />
            <KpiCard
              label={t('utilizationThisMonth')}
              value={`${monthUtil}%`}
              sub={`${monthBillH.toFixed(1)}h / ${monthCapH.toFixed(1)}h ${t('capacityLabel')}`}
              accent="bg-gradient-to-r from-brand-600 to-indigo-400"
              bar={Math.min(monthUtil, 100)}
              barClass={utilBarClass}
              trend={<TrendBadge current={monthUtil} previous={prevWeekUtil} />}
            />
            <KpiCard
              label={t('activeProjects')}
              value={String(activeProjectCount)}
              sub={`${activeMembers.length} ${t('memberLabel')}`}
              accent="bg-gradient-to-r from-violet-500 to-purple-400"
              bar={50}
              barClass="bg-violet-400"
            />
          </>
        ) : (
          /* Member / PM view */
          <>
            <KpiCard
              label={t('thisWeek')}
              value={formatDuration(weekSecs)}
              sub={seesTeam ? t('teamHours') : t('yourHours')}
              accent="bg-gradient-to-r from-brand-600 to-indigo-400"
              bar={totalWeeklyH > 0 ? Math.min(weekSecs / 3600 / totalWeeklyH * 100, 100) : 0}
              barClass="bg-brand-600"
              trend={<TrendBadge current={weekSecs} previous={prevWeekSecs} />}
            />
            <KpiCard
              label={t('thisMonth')}
              value={formatDuration(monthSecs)}
              sub={seesTeam ? t('teamHours') : t('yourHours')}
              accent="bg-gradient-to-r from-violet-500 to-purple-400"
              bar={monthCapH > 0 ? Math.min(monthSecs / 3600 / monthCapH * 100, 100) : 0}
              barClass="bg-violet-500"
              trend={<TrendBadge current={monthSecs} previous={prevMonthSecs} />}
            />
            <KpiCard
              label={t('monthlyEarnings')}
              value={formatMoney(earnings)}
              sub={t('billableOnly')}
              accent="bg-gradient-to-r from-emerald-500 to-teal-400"
              bar={prevEarnings > 0 ? Math.min(earnings / Math.max(earnings, prevEarnings) * 100, 100) : 60}
              barClass="bg-emerald-500"
              trend={<TrendBadge current={earnings} previous={prevEarnings} />}
            />
            <KpiCard
              label={t('utilizationThisMonth')}
              value={`${monthUtil}%`}
              sub={`${monthBillH.toFixed(1)}h / ${monthCapH.toFixed(1)}h`}
              accent="bg-gradient-to-r from-amber-500 to-yellow-400"
              bar={Math.min(monthUtil, 100)}
              barClass={utilBarClass}
              trend={<TrendBadge current={monthUtil} previous={prevWeekUtil} />}
            />
          </>
        )}
      </div>

      {/* ── Middle row: project health + team status ───────────────────────── */}
      {seesTeam && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Project health — partner/admin only */}
          {isTeamViewer && (
            <div className="card overflow-hidden lg:col-span-2">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{t('projectHealth')}</h2>
                <Link href="/projects" className="text-xs text-brand-600 hover:text-brand-700 font-medium">{t('viewAll')}</Link>
              </div>
              {loading ? (
                <div className="p-5 space-y-4">
                  {[1, 2, 3].map(n => (
                    <div key={n} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="skeleton h-3.5 w-40" />
                        <div className="skeleton h-3.5 w-10" />
                      </div>
                      <div className="skeleton h-1.5 w-full rounded-full" />
                      <div className="skeleton h-3 w-24" />
                    </div>
                  ))}
                </div>
              ) : projectHealth.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Briefcase className="w-4 h-4 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('allProjectsOnTrack')}</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">{t('noBudgetProjects')}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {projectHealth.slice(0, 6).map(p => {
                    const barColor   = p.budgetPct >= 100 ? 'bg-red-500' : p.budgetPct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
                    const textColor  = p.budgetPct >= 100 ? 'text-red-500' : p.budgetPct >= 80 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
                    return (
                      <div key={p.id} className="px-5 py-3.5 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                            <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                            {p.clientName && <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">· {p.clientName}</span>}
                          </div>
                          <span className={`text-xs font-bold tabular-nums ml-3 shrink-0 ${textColor}`}>
                            {Math.round(p.budgetPct)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(p.budgetPct, 100)}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {p.trackedDisplay} / {p.budgetDisplay} {t('ofBudget')}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Team live status */}
          <div className={`card overflow-hidden ${!isTeamViewer ? 'lg:col-span-3' : ''}`}>
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{t('teamStatus')}</h2>
              <span className="text-xs text-muted-foreground">
                {now.toLocaleTimeString(locale === 'de' ? 'de-AT' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <TeamStatus workspaceId={workspaceId} members={members} supabase={supabase} />
          </div>

        </div>
      )}

      {/* ── Recent entries ─────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t('recentEntries')}</h2>
          <Link href="/timer" className="text-xs text-brand-600 hover:text-brand-700 font-medium">{t('viewAll')}</Link>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            [1, 2, 3, 4].map(n => (
              <div key={n} className="px-5 py-4 flex items-center gap-4">
                <div className="skeleton w-2.5 h-2.5 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-48" />
                  <div className="skeleton h-3 w-32" />
                </div>
                <div className="skeleton h-4 w-16" />
              </div>
            ))
          ) : recent.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Clock className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{t('noEntriesYet')}</p>
              <p className="text-xs text-muted-foreground/50 mt-1">{t('startTimerHint')}</p>
              <Link href="/timer" className="mt-4 inline-flex btn-primary">{t('startTracking')}</Link>
            </div>
          ) : recent.map((entry: any) => (
            <div key={entry.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-muted/30 transition-colors">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.project?.color || '#e5e7eb' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {entry.description || <span className="text-muted-foreground italic">{t('noDescription')}</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {entry.project?.name || t('noProject')}
                  {' · '}
                  {formatDistanceToNow(new Date(entry.start_time), { addSuffix: true, locale: dateLocale })}
                </p>
              </div>
              <div className="text-right shrink-0 flex items-center gap-2">
                {entry.billable && (
                  <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                    {t('billable')}
                  </span>
                )}
                <p className="text-sm font-mono font-medium text-foreground tabular-nums">
                  {entry.duration_sec ? formatDuration(entry.duration_sec) : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ─── TeamStatus ───────────────────────────────────────────────────────────────

function TeamStatus({ workspaceId, members, supabase }: {
  workspaceId: string; members: any[]; supabase: any
}) {
  const { t } = useI18n()
  const [statuses, setStatuses] = useState<Record<string, any>>({})
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('time_entries')
      .select('user_id, start_time, project:projects(name, color)')
      .eq('workspace_id', workspaceId)
      .is('end_time', null)
    const map: Record<string, any> = {}
    for (const d of data || []) map[d.user_id] = d
    setStatuses(map)
  }, [supabase, workspaceId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`team-status-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: `workspace_id=eq.${workspaceId}` }, load)
      .subscribe()
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => { supabase.removeChannel(channel); clearInterval(timer) }
  }, [workspaceId, load, supabase])

  // suppress unused warning — tick forces re-render for live elapsed time
  void tick

  const active = members.filter(m => m.status === 'active')
  if (active.length === 0) return (
    <div className="px-5 py-8 text-center text-xs text-muted-foreground">{t('noTeamMembers')}</div>
  )

  const tracking = active.filter(m => statuses[m.user_id || ''])
  const idle     = active.filter(m => !statuses[m.user_id || ''])

  return (
    <div className="divide-y divide-border">
      {[...tracking, ...idle].map(m => {
        const running = statuses[m.user_id || '']
        const name    = m.full_name || m.email
        const elapsed = running
          ? Math.floor((Date.now() - new Date(running.start_time).getTime()) / 1000)
          : 0
        const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0')
        const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
        const ss = String(elapsed % 60).padStart(2, '0')

        return (
          <div key={m.id} className="px-5 py-3.5 flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-7 h-7 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 text-xs font-bold">
                {name[0].toUpperCase()}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${running ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{name}</p>
              {running ? (
                <p className="text-xs text-muted-foreground truncate">
                  <span className="text-emerald-500 font-medium">● {t('trackingActive')}</span>
                  {running.project?.name && ` · ${running.project.name}`}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('notTracking')}</p>
              )}
            </div>
            {running && (
              <span className="font-mono text-xs font-semibold text-emerald-600 tabular-nums">
                {hh}:{mm}:{ss}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
