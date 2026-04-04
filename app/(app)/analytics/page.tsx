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
import { Lock, Download, ChevronDown } from 'lucide-react'
import KairosLoader from '@/components/KairosLoader'

import AIChat from '@/components/AIChat'
import { AlertsSection } from './_components/AlertsSection'
import { KPIRow } from './_components/KPIRow'
import { CashflowSection } from './_components/CashflowSection'
import { TeamUtilizationSection } from './_components/TeamUtilizationSection'
import { RevenueTrendSection } from './_components/RevenueTrendSection'
import { BurndownSection } from './_components/BurndownSection'
import { ProjectHealthSection } from './_components/ProjectHealthSection'

export type Period = 'this_week' | 'this_month' | 'last_month' | 'last_3m' | 'custom'

/** Count Mon–Fri days in [from, to] inclusive */
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

export default function AnalyticsPage() {
  const supabase = createClient()
  const { workspaceId, role, members, managedProjectIds, isProjectManager } = useWorkspace()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS

  const [entries, setEntries] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [timeOffEntries, setTimeOffEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedProject, setSelectedProject] = useState('all')
  const [utilMemberId, setUtilMemberId] = useState('all')
  const [period, setPeriod] = useState<Period>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!workspaceId) return
    const sixMonthsAgo = subMonths(new Date(), 6)
    const [{ data: entriesData }, { data: projectsData }, { data: invoicesData }, { data: timeOffData }] = await Promise.all([
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
      supabase.from('time_off_entries')
        .select('user_id, date, hours')
        .eq('workspace_id', workspaceId)
        .gte('date', format(sixMonthsAgo, 'yyyy-MM-dd')),
    ])
    setEntries(entriesData || [])
    setProjects(projectsData || [])
    setInvoices(invoicesData || [])
    setTimeOffEntries(timeOffData || [])
    setLoading(false)
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

  if (!can(role, 'view:analytics') && !isProjectManager) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Lock className="w-8 h-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{t('analyticsAdminOnly')}</p>
    </div>
  )
  if (loading) return <KairosLoader size="sm" />

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

  // ── Time-off & capacity helpers ──────────────────────────────────────────
  function timeOffHours(userId: string, from: Date, to: Date) {
    return timeOffEntries
      .filter(e => e.user_id === userId && e.date >= format(from, 'yyyy-MM-dd') && e.date <= format(to, 'yyyy-MM-dd'))
      .reduce((s: number, e: any) => s + (e.hours || 0), 0)
  }

  function memberCapacity(weeklyHours: number, workdays: number, userId: string, from: Date, to: Date) {
    return Math.max(0, weeklyHours * (workdays / 5) - timeOffHours(userId, from, to))
  }

  // ── Period bounds (workday-based capacity) ───────────────────────────────
  const PERIODS: { value: Period; label: string }[] = [
    { value: 'this_week',  label: t('thisWeekLabel') },
    { value: 'this_month', label: t('thisMonthLabel') },
    { value: 'last_month', label: t('lastMonthLabel') },
    { value: 'last_3m',    label: t('last3Months') },
    { value: 'custom',     label: locale === 'de' ? 'Benutzerdefiniert' : 'Custom' },
  ]
  const periodLabel = PERIODS.find(p => p.value === period)?.label ?? ''

  const periodBounds = (() => {
    const n = new Date()
    switch (period) {
      case 'this_week': {
        const s = startOfWeek(n, { weekStartsOn: 1 })
        return { from: s, to: n, workdays: 5 }
      }
      case 'last_month': {
        const lm = subMonths(n, 1); const s = startOfMonth(lm); const e = endOfMonth(lm)
        return { from: s, to: e, workdays: countWeekdays(s, e) }
      }
      case 'last_3m': {
        const s = startOfMonth(subMonths(n, 2))
        return { from: s, to: n, workdays: countWeekdays(s, n) }
      }
      case 'custom': {
        const from = customFrom ? new Date(customFrom + 'T00:00:00') : startOfMonth(n)
        const to   = customTo   ? new Date(customTo   + 'T23:59:59') : n
        return { from, to, workdays: Math.max(countWeekdays(from, to), 1) }
      }
      default: {
        const s = startOfMonth(n)
        return { from: s, to: n, workdays: Math.max(countWeekdays(s, n), 1) }
      }
    }
  })()

  // ── Period-filtered entries & KPIs ───────────────────────────────────────
  const periodEntries  = withEarnings.filter(e => new Date(e.start_time) >= periodBounds.from && new Date(e.start_time) <= periodBounds.to)
  const revenuePeriod  = periodEntries.reduce((s, e) => s + (e.billable ? e.earnings : 0), 0)
  const billableHours  = periodEntries.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
  const totalCapacity  = activeMembers.reduce((s, m) => s + memberCapacity(m.weekly_hours ?? 40, periodBounds.workdays, m.user_id!, periodBounds.from, periodBounds.to), 0)
  const utilization    = totalCapacity > 0 ? Math.round(billableHours / totalCapacity * 100) : 0
  const avgRate        = billableHours > 0 ? revenuePeriod / billableHours : 0
  const pipeline       = scopedProjects.reduce((s, p) => {
    const spent = withEarnings.filter(e => e.project_id === p.id && e.billable).reduce((a, e) => a + e.earnings, 0)
    return s + Math.max(0, (p.budget_amount || 0) - spent)
  }, 0)

  // ── Previous period (symmetric window) ──────────────────────────────────
  const periodMs = periodBounds.to.getTime() - periodBounds.from.getTime()
  const prevFrom = new Date(periodBounds.from.getTime() - periodMs - 1)
  const prevTo   = new Date(periodBounds.from.getTime() - 1)
  const prevWorkdays = countWeekdays(prevFrom, prevTo)
  const prevBounds = { from: prevFrom, to: prevTo, workdays: prevWorkdays }

  const prevEntries     = withEarnings.filter(e => { const d = new Date(e.start_time); return d >= prevBounds.from && d <= prevBounds.to })
  const prevRevenue     = prevEntries.reduce((s, e) => s + (e.billable ? e.earnings : 0), 0)
  const prevBillH       = prevEntries.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
  const prevCapacity    = activeMembers.reduce((s, m) => s + memberCapacity(m.weekly_hours ?? 40, prevBounds.workdays, m.user_id!, prevBounds.from, prevBounds.to), 0)
  const prevUtilization = prevCapacity > 0 ? Math.round(prevBillH / prevCapacity * 100) : 0
  const prevAvgRate     = prevBillH > 0 ? prevRevenue / prevBillH : 0

  // ── Forecast (this_month only) ────────────────────────────────────────────
  const dayOfMonth = now.getDate()
  const daysInMonth = endOfMonth(now).getDate()
  const revenueForecast = period === 'this_month' && dayOfMonth >= 3 ? Math.round(revenuePeriod / dayOfMonth * daysInMonth) : null

  // ── Revenue trend (always 6-month rolling) ───────────────────────────────
  const months = eachMonthOfInterval({ start: subMonths(now, 5), end: now })
  const revenueTrend = months.map(m => {
    const mStart = startOfMonth(m); const mEnd = endOfMonth(m)
    const isCurrent = mStart.getTime() === startOfMonth(now).getTime()
    const rev = withEarnings.filter(e => e.billable && new Date(e.start_time) >= mStart && new Date(e.start_time) <= mEnd).reduce((s, e) => s + e.earnings, 0)
    const hrs = withEarnings.filter(e => new Date(e.start_time) >= mStart && new Date(e.start_time) <= mEnd).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    return { month: format(m, 'MMM', { locale: dateFnsLocale }), revenue: parseFloat(rev.toFixed(0)), hours: parseFloat(hrs.toFixed(1)), forecast: isCurrent && revenueForecast ? revenueForecast : undefined }
  })

  // ── Client revenue (period-filtered) ─────────────────────────────────────
  const clientMap: Record<string, { name: string; color: string; revenue: number }> = {}
  periodEntries.filter(e => e.billable).forEach(e => {
    const n = e.project?.client?.name || 'No client'
    const c = e.project?.client?.color || e.project?.color || '#6366f1'
    if (!clientMap[n]) clientMap[n] = { name: n, color: c, revenue: 0 }
    clientMap[n].revenue += e.earnings
  })
  const clientData = Object.values(clientMap).sort((a, b) => b.revenue - a.revenue).slice(0, 6)

  // ── Team utilization (all metrics per member, period-filtered) ───────────
  const teamUtilUnified = activeMembers.map(m => {
    const inRange = (e: any) => new Date(e.start_time) >= periodBounds.from && new Date(e.start_time) <= periodBounds.to
    const inPrev  = (e: any) => new Date(e.start_time) >= prevBounds.from  && new Date(e.start_time) <= prevBounds.to
    const mE = withEarnings.filter(e => e.user_id === m.user_id)
    const billable    = mE.filter(e => e.billable  && inRange(e)).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const nonBillable = mE.filter(e => !e.billable && inRange(e)).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const revenue     = mE.filter(e => e.billable  && inRange(e)).reduce((s, e) => s + e.earnings, 0)
    const capacity    = memberCapacity(m.weekly_hours ?? 40, periodBounds.workdays, m.user_id!, periodBounds.from, periodBounds.to)
    const pct         = capacity > 0 ? Math.round(billable / capacity * 100) : 0
    const prevBill    = mE.filter(e => e.billable && inPrev(e)).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const prevCap     = memberCapacity(m.weekly_hours ?? 40, prevBounds.workdays, m.user_id!, prevBounds.from, prevBounds.to)
    const prevPct     = prevCap > 0 ? Math.round(prevBill / prevCap * 100) : 0
    const avgHourlyRate = billable > 0 ? revenue / billable : 0
    return {
      userId: m.user_id,
      name: m.full_name || m.email || 'Unknown',
      email: (m as any).email || '',
      billable: parseFloat(billable.toFixed(1)),
      nonBillable: parseFloat(nonBillable.toFixed(1)),
      revenue,
      capacity: parseFloat(capacity.toFixed(1)),
      pct,
      trend: pct - prevPct,
      avgHourlyRate: parseFloat(avgHourlyRate.toFixed(0)),
    }
  }).sort((a, b) => b.pct - a.pct)

  // ── Drill-down (single member) ───────────────────────────────────────────
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
      const toHours  = timeOffHours(drillMember.user_id!, wStart, wEnd)
      const capacity = Math.max(0, (drillMember.weekly_hours ?? 40) - toHours)
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

  // ── Burnout / anomaly detection ──────────────────────────────────────────
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
  scopedProjects.forEach(p => {
    const thisW = withEarnings.filter(e => e.project_id === p.id && e.billable && new Date(e.start_time) >= thisWeekStart).reduce((s, e) => s + e.earnings, 0)
    const lastW = withEarnings.filter(e => e.project_id === p.id && e.billable && new Date(e.start_time) >= lastWeekStart && new Date(e.start_time) <= lastWeekEnd).reduce((s, e) => s + e.earnings, 0)
    if (lastW > 200 && thisW > lastW * 2.5) anomalies.push({ message: `${p.name} — burn rate ${Math.round(thisW / lastW)}× vs last week`, severity: 'error' })
  })

  // ── Budget burndown ───────────────────────────────────────────────────────
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

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV(type: 'consultant' | 'project' | 'client') {
    let rows: string[][]
    let filename: string
    const d = format(now, 'yyyy-MM-dd')
    if (type === 'consultant') {
      rows = [['Consultant', 'Billable Hours', 'Non-Billable Hours', 'Revenue', 'Avg Rate', 'Utilization %']]
      teamUtilUnified.forEach(m => rows.push([m.name, m.billable.toFixed(1), m.nonBillable.toFixed(1), m.revenue.toFixed(2), m.avgHourlyRate.toFixed(0), String(m.pct)]))
      filename = `kairos-consultants-${d}.csv`
    } else if (type === 'project') {
      rows = [['Project', 'Client', 'Hours Spent', 'Revenue', 'Budget Amount', 'Budget Used %', 'Hours Budget', 'Hours Used %']]
      projectHealth.forEach(({ p, spent, hoursSpent, budgetPct, hoursPct }) => {
        const client = (p.client as any)?.name || ''
        rows.push([p.name, client, hoursSpent.toFixed(1), spent.toFixed(2), String(p.budget_amount || ''), String(budgetPct ?? ''), String(p.budget_hours || ''), String(hoursPct ?? '')])
      })
      filename = `kairos-projects-${d}.csv`
    } else {
      rows = [['Client', 'Revenue', 'Share %']]
      const total = clientData.reduce((s, c) => s + c.revenue, 0)
      clientData.forEach(c => rows.push([c.name, c.revenue.toFixed(2), total > 0 ? Math.round(c.revenue / total * 100).toString() : '0']))
      filename = `kairos-clients-${d}.csv`
    }
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Compare helpers ───────────────────────────────────────────────────────
  function toggleCompare(userId: string) {
    setSelectedForCompare(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else if (next.size < 5) next.add(userId)
      return next
    })
  }

  const periodDateRange = period === 'custom' && (customFrom || customTo)
    ? `${customFrom ? format(new Date(customFrom + 'T00:00:00'), 'd. MMM', { locale: dateFnsLocale }) : '?'} – ${customTo ? format(new Date(customTo + 'T00:00:00'), 'd. MMM yyyy', { locale: dateFnsLocale }) : '?'}`
    : null

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('analyticsTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {periodDateRange
              ? periodDateRange
              : `${t('analyticsSubtitle')} · ${periodLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period segmented control */}
          <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => { setPeriod(p.value); if (p.value !== 'custom') { setCustomFrom(''); setCustomTo('') } }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  period === p.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {period === 'custom' && (
            <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="bg-transparent text-xs text-foreground outline-none w-32"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <input
                type="date"
                value={customTo}
                max={format(now, 'yyyy-MM-dd')}
                onChange={e => setCustomTo(e.target.value)}
                className="bg-transparent text-xs text-foreground outline-none w-32"
              />
            </div>
          )}

          {/* Export */}
          <div className="relative group">
            <button className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3">
              <Download className="w-3.5 h-3.5" />
              Export
              <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-xl shadow-lg py-1 z-20 hidden group-hover:block">
              <button onClick={() => exportCSV('consultant')} className="w-full text-left px-4 py-2 text-xs text-foreground hover:bg-muted transition-colors">{t('byConsultant')}</button>
              <button onClick={() => exportCSV('project')}    className="w-full text-left px-4 py-2 text-xs text-foreground hover:bg-muted transition-colors">{t('byProject')}</button>
              <button onClick={() => exportCSV('client')}     className="w-full text-left px-4 py-2 text-xs text-foreground hover:bg-muted transition-colors">{t('byClient')}</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      <AlertsSection burnoutRisks={burnoutRisks} anomalies={anomalies} />

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      <KPIRow
        revenuePeriod={revenuePeriod}
        pipeline={pipeline}
        utilization={utilization}
        avgRate={avgRate}
        revenueForecast={revenueForecast}
        periodLabel={periodLabel}
        prevRevenue={prevRevenue}
        prevUtilization={prevUtilization}
        prevAvgRate={prevAvgRate}
        totalBillableHours={billableHours}
        totalCapacity={totalCapacity}
      />

      {/* ── Revenue trend + client breakdown (always 6-month rolling) ───────── */}
      <RevenueTrendSection
        revenueTrend={revenueTrend}
        clientData={clientData}
        revenueForecast={revenueForecast}
        periodLabel={periodLabel}
      />

      {/* ── Cashflow (Partners only) ─────────────────────────────────────────── */}
      {cashflow && (
        <CashflowSection
          cashflow={cashflow}
          invoices={invoices}
          today={now}
          inPeriod={inPeriod}
          periodLabel={periodLabel}
        />
      )}

      {/* ── Team utilization + comparison ────────────────────────────────────── */}
      <TeamUtilizationSection
        teamUtilUnified={teamUtilUnified}
        drillMember={drillMember}
        drillWeekData={drillWeekData}
        drillProjectBreakdown={drillProjectBreakdown}
        utilMemberId={utilMemberId}
        setUtilMemberId={setUtilMemberId}
        activeMembers={activeMembers}
        periodLabel={periodLabel}
        compareMode={compareMode}
        selectedForCompare={selectedForCompare}
        onToggleCompareMode={() => { setCompareMode(v => !v); setSelectedForCompare(new Set()) }}
        onToggleSelectForCompare={toggleCompare}
      />

      {/* ── Project health ───────────────────────────────────────────────────── */}
      <ProjectHealthSection projectHealth={projectHealth} />

      {/* ── Budget burndown ──────────────────────────────────────────────────── */}
      <BurndownSection
        scopedProjects={scopedProjects}
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        burndownData={burndownData}
        burndownProject={burndownProject}
        burndownEntries={burndownEntries}
        entries={scopedEntries}
      />

      {/* ── AI ───────────────────────────────────────────────────────────────── */}
      <AIChat />
    </div>
  )
}
