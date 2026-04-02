'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { calcEntryEarnings } from '@/lib/types'
import {
  format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval,
  parseISO, differenceInDays, startOfWeek, endOfWeek, subWeeks,
} from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { Lock } from 'lucide-react'

import { AlertsSection } from './_components/AlertsSection'
import { KPIRow } from './_components/KPIRow'
import { CashflowSection } from './_components/CashflowSection'
import { TeamUtilizationSection } from './_components/TeamUtilizationSection'
import { RevenueTrendSection } from './_components/RevenueTrendSection'
import { BurndownSection } from './_components/BurndownSection'
import { ProjectHealthSection } from './_components/ProjectHealthSection'

export default function AnalyticsPage() {
  const supabase = createClient()
  const { workspaceId, role, members, managedProjectIds, isProjectManager } = useWorkspace()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS

  const [entries, setEntries] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState('all')
  const [utilMemberId, setUtilMemberId] = useState('all')
  const [period, setPeriod] = useState<'this_week' | 'this_month' | 'last_month' | 'last_3m'>('this_month')

  const load = useCallback(async () => {
    if (!workspaceId) return
    const sixMonthsAgo = subMonths(new Date(), 6)
    const [{ data: entriesData }, { data: projectsData }, { data: invoicesData }] = await Promise.all([
      supabase.from('time_entries')
        .select('id, user_id, project_id, start_time, duration_sec, billable, hourly_rate, level_id, project:projects(id, name, color, hourly_rate, client:clients(name, color))')
        .eq('workspace_id', workspaceId)
        .not('end_time', 'is', null)
        .gte('start_time', sixMonthsAgo.toISOString())
        .order('start_time', { ascending: true }),
      supabase.from('projects')
        .select('*, client:clients(*), level_rates:project_level_rates(*)')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active'),
      can(role, 'manage:invoices')
        ? supabase.from('invoices').select('id, subtotal, status, due_date, sent_at, paid_at, created_at, client_name').eq('workspace_id', workspaceId)
        : Promise.resolve({ data: [] }),
    ])
    setEntries(entriesData || [])
    setProjects(projectsData || [])
    setInvoices(invoicesData || [])
    setLoading(false)
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

  if (!can(role, 'view:analytics') && !isProjectManager) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Lock className="w-8 h-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{t('analyticsAdminOnly')}</p>
    </div>
  )
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Scope ────────────────────────────────────────────────────────────────
  const seeAll = can(role, 'review:all')
  const scopedEntries  = seeAll ? entries  : entries.filter(e => managedProjectIds.includes(e.project_id))
  const scopedProjects = seeAll ? projects : projects.filter(p => managedProjectIds.includes(p.id))

  // ── Earnings ─────────────────────────────────────────────────────────────
  const projectById = Object.fromEntries(projects.map(p => [p.id, p]))
  const withEarnings = scopedEntries.map(e => ({
    ...e,
    earnings: e.duration_sec
      ? (e.hourly_rate > 0 ? (e.duration_sec / 3600) * e.hourly_rate : calcEntryEarnings(e.duration_sec, projectById[e.project_id], e.level_id))
      : 0,
  }))

  const now = new Date()
  const pmMemberUserIdSet = seeAll ? null : new Set(scopedEntries.map(e => e.user_id))
  const activeMembers = members.filter(m => m.status === 'active' && (!pmMemberUserIdSet || pmMemberUserIdSet.has(m.user_id)))

  // ── Period ───────────────────────────────────────────────────────────────
  const periodLabel = period === 'this_week' ? t('thisWeekLabel')
    : period === 'last_month' ? t('lastMonthLabel')
    : period === 'last_3m' ? t('last3Months')
    : t('thisMonthLabel')

  const periodBounds = (() => {
    const n = new Date()
    switch (period) {
      case 'this_week': { const s = startOfWeek(n, { weekStartsOn: 1 }); return { from: s, to: n, weeks: Math.max((n.getTime() - s.getTime()) / (7 * 24 * 3600 * 1000), 1 / 7) } }
      case 'last_month': { const lm = subMonths(n, 1); const s = startOfMonth(lm); const e = endOfMonth(lm); return { from: s, to: e, weeks: (e.getTime() - s.getTime()) / (7 * 24 * 3600 * 1000) } }
      case 'last_3m': { const s = startOfMonth(subMonths(n, 2)); return { from: s, to: n, weeks: Math.max((n.getTime() - s.getTime()) / (7 * 24 * 3600 * 1000), 1 / 7) } }
      default: { const s = startOfMonth(n); return { from: s, to: n, weeks: Math.max((n.getTime() - s.getTime()) / (7 * 24 * 3600 * 1000), 1 / 7) } }
    }
  })()

  const periodEntries = withEarnings.filter(e => new Date(e.start_time) >= periodBounds.from && new Date(e.start_time) <= periodBounds.to)
  const revenuePeriod  = periodEntries.reduce((s, e) => s + (e.billable ? e.earnings : 0), 0)
  const billableHours  = periodEntries.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
  const totalCapacity  = activeMembers.reduce((s, m) => s + (m.weekly_hours ?? 40) * periodBounds.weeks, 0)
  const utilization    = totalCapacity > 0 ? Math.round(billableHours / totalCapacity * 100) : 0
  const avgRate        = billableHours > 0 ? revenuePeriod / billableHours : 0
  const pipeline       = scopedProjects.reduce((s, p) => {
    const spent = withEarnings.filter(e => e.project_id === p.id && e.billable).reduce((a, e) => a + e.earnings, 0)
    return s + Math.max(0, (p.budget_amount || 0) - spent)
  }, 0)

  // ── Forecast ─────────────────────────────────────────────────────────────
  const dayOfMonth = now.getDate()
  const daysInMonth = endOfMonth(now).getDate()
  const revenueForecast = period === 'this_month' && dayOfMonth >= 3 ? Math.round(revenuePeriod / dayOfMonth * daysInMonth) : null

  // ── Revenue trend (6 months) ─────────────────────────────────────────────
  const months = eachMonthOfInterval({ start: subMonths(now, 5), end: now })
  const revenueTrend = months.map(m => {
    const mStart = startOfMonth(m)
    const mEnd = endOfMonth(m)
    const isCurrentMonth = mStart.getTime() === startOfMonth(now).getTime()
    const rev = withEarnings.filter(e => e.billable && new Date(e.start_time) >= mStart && new Date(e.start_time) <= mEnd).reduce((s, e) => s + e.earnings, 0)
    const hrs = withEarnings.filter(e => new Date(e.start_time) >= mStart && new Date(e.start_time) <= mEnd).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const forecast = isCurrentMonth && revenueForecast ? revenueForecast : undefined
    return { month: format(m, 'MMM', { locale: dateFnsLocale }), revenue: parseFloat(rev.toFixed(0)), hours: parseFloat(hrs.toFixed(1)), forecast }
  })

  // ── Team utilization ─────────────────────────────────────────────────────
  const periodMs = periodBounds.to.getTime() - periodBounds.from.getTime()
  const prevFrom = new Date(periodBounds.from.getTime() - periodMs)
  const prevTo   = new Date(periodBounds.from.getTime() - 1)

  const teamUtilUnified = activeMembers.map(m => {
    const inRange = (e: any) => new Date(e.start_time) >= periodBounds.from && new Date(e.start_time) <= periodBounds.to
    const inPrev  = (e: any) => new Date(e.start_time) >= prevFrom && new Date(e.start_time) <= prevTo
    const mE = withEarnings.filter(e => e.user_id === m.user_id)
    const billable    = mE.filter(e => e.billable && inRange(e)).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const nonBillable = mE.filter(e => !e.billable && inRange(e)).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const revenue     = mE.filter(e => e.billable && inRange(e)).reduce((s, e) => s + e.earnings, 0)
    const capacity    = (m.weekly_hours ?? 40) * periodBounds.weeks
    const pct         = capacity > 0 ? Math.round(billable / capacity * 100) : 0
    const prevBill    = mE.filter(e => e.billable && inPrev(e)).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const prevPct     = capacity > 0 ? Math.round(prevBill / capacity * 100) : 0
    return { userId: m.user_id, name: m.full_name || m.email || 'Unknown', billable: parseFloat(billable.toFixed(1)), nonBillable: parseFloat(nonBillable.toFixed(1)), revenue, capacity: parseFloat(capacity.toFixed(1)), pct, trend: pct - prevPct }
  }).sort((a, b) => b.pct - a.pct)

  // ── Drill-down ───────────────────────────────────────────────────────────
  const drillMember = utilMemberId !== 'all' ? activeMembers.find(m => m.user_id === utilMemberId) : undefined

  const drillWeekData = (() => {
    if (!drillMember) return []
    const weeks: { week: string; billable: number; capacity: number; pct: number }[] = []
    let wStart = startOfWeek(periodBounds.from, { weekStartsOn: 1 })
    while (wStart <= periodBounds.to) {
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1 })
      const effStart = wStart < periodBounds.from ? periodBounds.from : wStart
      const effEnd   = wEnd   > periodBounds.to   ? periodBounds.to   : wEnd
      const mE = withEarnings.filter(e => e.user_id === drillMember.user_id && new Date(e.start_time) >= effStart && new Date(e.start_time) <= effEnd)
      const billable = mE.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
      const weekFraction = (effEnd.getTime() - effStart.getTime()) / (7 * 24 * 3600 * 1000)
      const capacity = (drillMember.weekly_hours ?? 40) * Math.max(weekFraction, 1 / 7)
      const pct = capacity > 0 ? Math.round(billable / capacity * 100) : 0
      if (billable > 0 || capacity > 0) weeks.push({ week: format(wStart, 'MMM d'), billable: parseFloat(billable.toFixed(1)), capacity: parseFloat(capacity.toFixed(1)), pct })
      wStart = new Date(wStart.getTime() + 7 * 24 * 3600 * 1000)
    }
    return weeks
  })()

  const drillProjectBreakdown = (() => {
    if (!drillMember) return []
    const mE = withEarnings.filter(e => e.user_id === drillMember.user_id && new Date(e.start_time) >= periodBounds.from && new Date(e.start_time) <= periodBounds.to)
    const byProject: Record<string, { name: string; billable: number; revenue: number; color: string }> = {}
    mE.forEach(e => {
      const pid = e.project_id || 'none'
      if (!byProject[pid]) byProject[pid] = { name: e.project?.name || 'No project', billable: 0, revenue: 0, color: e.project?.color || '#6366f1' }
      if (e.billable) { byProject[pid].billable += (e.duration_sec || 0) / 3600; byProject[pid].revenue += e.earnings }
    })
    return Object.values(byProject).sort((a, b) => b.billable - a.billable)
  })()

  // ── Burnout / anomalies ──────────────────────────────────────────────────
  const burnoutRisks = activeMembers.filter(m => {
    if (!m.weekly_hours || m.weekly_hours === 0) return false
    return [1, 2, 3].every(weeksAgo => {
      const wStart = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), weeksAgo)
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1 })
      const billH = withEarnings.filter(e => e.user_id === m.user_id && e.billable && new Date(e.start_time) >= wStart && new Date(e.start_time) <= wEnd).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
      return billH / (m.weekly_hours ?? 40) > 1.0
    })
  })

  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 })
  const lastWeekStart = subWeeks(thisWeekStart, 1)
  const lastWeekEnd   = endOfWeek(lastWeekStart, { weekStartsOn: 1 })
  type Anomaly = { message: string; severity: 'error' | 'warning' }
  const anomalies: Anomaly[] = []

  activeMembers.forEach(m => {
    if (!m.weekly_hours || m.weekly_hours === 0) return
    const thisWeekE = withEarnings.filter(e => e.user_id === m.user_id && new Date(e.start_time) >= thisWeekStart)
    const thisWeekBill  = thisWeekE.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const thisWeekTotal = thisWeekE.reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    if (thisWeekTotal === 0) anomalies.push({ message: `${m.full_name || m.email} — ${t('noTimeTrackedWeek')}`, severity: 'warning' })
    else if (thisWeekBill === 0) anomalies.push({ message: `${m.full_name || m.email} — ${t('noBillableWeek')}`, severity: 'warning' })
  })

  scopedProjects.forEach(p => {
    const thisW = withEarnings.filter(e => e.project_id === p.id && e.billable && new Date(e.start_time) >= thisWeekStart).reduce((s, e) => s + e.earnings, 0)
    const lastW = withEarnings.filter(e => e.project_id === p.id && e.billable && new Date(e.start_time) >= lastWeekStart && new Date(e.start_time) <= lastWeekEnd).reduce((s, e) => s + e.earnings, 0)
    if (lastW > 200 && thisW > lastW * 2.5) anomalies.push({ message: `${p.name} — burn rate ${Math.round(thisW / lastW)}× vs last week`, severity: 'error' })
  })

  // ── Burndown ─────────────────────────────────────────────────────────────
  const burndownProject = selectedProject !== 'all' ? scopedProjects.find(p => p.id === selectedProject) : null
  const burndownEntries = burndownProject ? withEarnings.filter(e => e.project_id === burndownProject.id && e.billable) : []
  let cumulativeCost = 0
  const burndownData: { date: string; spent: number; budget: number | null; forecast?: number }[] = []
  if (burndownProject && burndownEntries.length > 0) {
    const sorted = [...burndownEntries].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const firstDate = new Date(sorted[0].start_time)
    const dayMap: Record<string, number> = {}
    sorted.forEach(e => { const d = format(parseISO(e.start_time), 'yyyy-MM-dd'); dayMap[d] = (dayMap[d] || 0) + e.earnings })
    const sortedDays = Object.keys(dayMap).sort()
    sortedDays.forEach(day => { cumulativeCost += dayMap[day]; burndownData.push({ date: format(parseISO(day), 'MMM d'), spent: parseFloat(cumulativeCost.toFixed(0)), budget: burndownProject.budget_amount || null }) })
    if (burndownData.length >= 2 && burndownProject.budget_amount) {
      const daysElapsed = differenceInDays(new Date(sortedDays[sortedDays.length - 1]), firstDate) || 1
      const burnPerDay = cumulativeCost / daysElapsed
      const remaining = burndownProject.budget_amount - cumulativeCost
      if (remaining > 0 && burnPerDay > 0) {
        const daysLeft = Math.ceil(remaining / burnPerDay)
        const forecastDate = new Date(); forecastDate.setDate(forecastDate.getDate() + daysLeft)
        burndownData.push({ date: `${format(forecastDate, 'MMM d')} (est.)`, spent: parseFloat(burndownProject.budget_amount.toFixed(0)), budget: burndownProject.budget_amount, forecast: parseFloat(burndownProject.budget_amount.toFixed(0)) })
      }
    }
  }

  // ── Client revenue ────────────────────────────────────────────────────────
  const clientMap: Record<string, { name: string; color: string; revenue: number }> = {}
  withEarnings.filter(e => e.billable).forEach(e => {
    const n = e.project?.client?.name || 'No client'
    const c = e.project?.client?.color || e.project?.color || '#6366f1'
    if (!clientMap[n]) clientMap[n] = { name: n, color: c, revenue: 0 }
    clientMap[n].revenue += e.earnings
  })
  const clientData = Object.values(clientMap).sort((a, b) => b.revenue - a.revenue).slice(0, 6)

  // ── Cashflow ──────────────────────────────────────────────────────────────
  const inPeriod = (dateStr: string | null) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d >= periodBounds.from && d <= periodBounds.to
  }
  const cashflow = seeAll ? (() => {
    let billed = 0, paid = 0, open = 0, overdue = 0
    for (const inv of invoices) {
      const amount = Number(inv.subtotal) || 0
      if ((inv.status === 'paid' || inv.status === 'sent') && inPeriod(inv.sent_at || inv.created_at)) billed += amount
      if (inv.status === 'paid' && inPeriod(inv.paid_at)) paid += amount
      if (inv.status === 'sent') {
        if (new Date(inv.due_date) < now) overdue += amount
        else open += amount
      }
    }
    return { billed, paid, open, overdue }
  })() : null

  // ── Project health ────────────────────────────────────────────────────────
  const projectHealth = scopedProjects.map(p => {
    const spent = withEarnings.filter(e => e.project_id === p.id && e.billable).reduce((s, e) => s + e.earnings, 0)
    const hoursSpent = scopedEntries.filter(e => e.project_id === p.id).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const budgetPct = p.budget_amount ? Math.round(spent / p.budget_amount * 100) : null
    const hoursPct  = p.budget_hours  ? Math.round(hoursSpent / p.budget_hours * 100) : null
    const worstPct  = Math.max(budgetPct ?? 0, hoursPct ?? 0)
    return { p, spent, hoursSpent, budgetPct, hoursPct, worstPct }
  }).sort((a, b) => b.worstPct - a.worstPct)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('analyticsTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('analyticsSubtitle')}</p>
        </div>
        <select className="input w-auto text-xs py-1.5" value={period} onChange={e => setPeriod(e.target.value as typeof period)}>
          <option value="this_week">{t('thisWeekLabel')}</option>
          <option value="this_month">{t('thisMonthLabel')}</option>
          <option value="last_month">{t('lastMonthLabel')}</option>
          <option value="last_3m">{t('last3Months')}</option>
        </select>
      </div>

      <AlertsSection burnoutRisks={burnoutRisks} anomalies={anomalies} />

      <KPIRow
        revenuePeriod={revenuePeriod}
        pipeline={pipeline}
        utilization={utilization}
        avgRate={avgRate}
        revenueForecast={revenueForecast}
        periodLabel={periodLabel}
      />

      {cashflow && (
        <CashflowSection
          cashflow={cashflow}
          invoices={invoices}
          today={now}
          inPeriod={inPeriod}
          periodLabel={periodLabel}
        />
      )}

      <TeamUtilizationSection
        teamUtilUnified={teamUtilUnified}
        drillMember={drillMember}
        drillWeekData={drillWeekData}
        drillProjectBreakdown={drillProjectBreakdown}
        utilMemberId={utilMemberId}
        setUtilMemberId={setUtilMemberId}
        activeMembers={activeMembers}
        periodLabel={periodLabel}
      />

      <RevenueTrendSection
        revenueTrend={revenueTrend}
        clientData={clientData}
        revenueForecast={revenueForecast}
      />

      <BurndownSection
        scopedProjects={scopedProjects}
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        burndownData={burndownData}
        burndownProject={burndownProject}
        burndownEntries={burndownEntries}
        entries={scopedEntries}
      />

      <ProjectHealthSection projectHealth={projectHealth} />
    </div>
  )
}
