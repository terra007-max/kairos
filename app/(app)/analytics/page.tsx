'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { formatDuration, formatMoney, calcEntryEarnings } from '@/lib/types'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ReferenceLine, CartesianGrid
} from 'recharts'
import {
  format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval,
  parseISO, differenceInDays, startOfWeek, endOfWeek, subWeeks
} from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import {
  TrendingUp, DollarSign, Users, Zap, AlertTriangle, CheckCircle,
  XCircle, Lock, ArrowUpRight, ArrowDownRight, Minus, ChevronLeft, Activity, Receipt
} from 'lucide-react'

function healthColor(pct: number) {
  if (pct >= 100) return 'text-red-500'
  if (pct >= 80) return 'text-amber-500'
  return 'text-emerald-500'
}
function healthBg(pct: number) {
  if (pct >= 100) return 'bg-red-500/10 border-red-500/20'
  if (pct >= 80) return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-emerald-500/10 border-emerald-500/20'
}
function utilBarColor(pct: number) {
  if (pct > 110) return 'bg-red-500'
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-amber-500'
  return 'bg-muted-foreground/40'
}
function HealthIcon({ pct }: { pct: number }) {
  if (pct >= 100) return <XCircle className="w-4 h-4 text-red-500" />
  if (pct >= 80) return <AlertTriangle className="w-4 h-4 text-amber-500" />
  return <CheckCircle className="w-4 h-4 text-emerald-500" />
}
function TrendPill({ delta }: { delta: number }) {
  if (Math.abs(delta) < 2) return <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Minus className="w-2.5 h-2.5" />—</span>
  if (delta > 0) return <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-500"><ArrowUpRight className="w-2.5 h-2.5" />+{delta}pp</span>
  return <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400"><ArrowDownRight className="w-2.5 h-2.5" />{delta}pp</span>
}

export default function AnalyticsPage() {
  const supabase = createClient()
  const { workspaceId, role, members, managedProjectIds, isProjectManager } = useWorkspace()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS
  const [entries, setEntries] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [utilMemberId, setUtilMemberId] = useState<string>('all')
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
  }, [supabase, workspaceId])

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

  // ── Scope: review:all sees everything; review:managed sees own projects only
  const seeAll = can(role, 'review:all')
  const scopedEntries = seeAll ? entries : entries.filter(e => managedProjectIds.includes(e.project_id))
  const scopedProjects = seeAll ? projects : projects.filter(p => managedProjectIds.includes(p.id))

  // ── Earnings ─────────────────────────────────────────────────────────────
  // Build a project lookup once so earnings calculation doesn't search arrays per entry
  const projectById = Object.fromEntries(projects.map(p => [p.id, p]))
  const withEarnings = scopedEntries.map(e => ({
    ...e,
    earnings: e.duration_sec
      ? (e.hourly_rate > 0 ? (e.duration_sec / 3600) * e.hourly_rate : calcEntryEarnings(e.duration_sec, projectById[e.project_id], e.level_id))
      : 0,
  }))

  const now = new Date()
  // PMs only see members who have entries on their managed projects
  const pmMemberUserIdSet = seeAll ? null : new Set(scopedEntries.map(e => e.user_id))
  const activeMembers = members.filter(m => m.status === 'active' && (!pmMemberUserIdSet || pmMemberUserIdSet.has(m.user_id)))

  const periodLabel = period === 'this_week' ? t('thisWeekLabel')
    : period === 'last_month' ? t('lastMonthLabel')
    : period === 'last_3m' ? t('last3Months')
    : t('thisMonthLabel')

  // ── Global period bounds (drives all KPIs, cashflow and utilization table) ─
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
  const revenuePeriod = periodEntries.reduce((s, e) => s + (e.billable ? e.earnings : 0), 0)
  const billableHours = periodEntries.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
  const totalCapacity = activeMembers.reduce((s, m) => s + (m.weekly_hours ?? 40) * periodBounds.weeks, 0)
  const utilization = totalCapacity > 0 ? Math.round(billableHours / totalCapacity * 100) : 0
  const avgRate = billableHours > 0 ? revenuePeriod / billableHours : 0
  const pipeline = scopedProjects.reduce((s, p) => {
    const spent = withEarnings.filter(e => e.project_id === p.id && e.billable).reduce((a, e) => a + e.earnings, 0)
    return s + Math.max(0, (p.budget_amount || 0) - spent)
  }, 0)

  // ── Revenue forecast (linear projection to month end, this_month only) ────
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

  // ── Unified team utilization (overview) ──────────────────────────────────
  const periodMs = periodBounds.to.getTime() - periodBounds.from.getTime()
  const prevFrom = new Date(periodBounds.from.getTime() - periodMs)
  const prevTo = new Date(periodBounds.from.getTime() - 1)

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
    return {
      userId: m.user_id,
      name: m.full_name || m.email || 'Unknown',
      shortName: (m.full_name || m.email || 'Unknown').split(' ')[0],
      billable: parseFloat(billable.toFixed(1)),
      nonBillable: parseFloat(nonBillable.toFixed(1)),
      revenue, capacity: parseFloat(capacity.toFixed(1)),
      pct, trend: pct - prevPct,
    }
  }).sort((a, b) => b.pct - a.pct)

  // ── Drill-down: selected member ──────────────────────────────────────────
  const drillMember = utilMemberId !== 'all' ? activeMembers.find(m => m.user_id === utilMemberId) : null

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

  // ── Burnout Risk: last 3 completed weeks all > 100% util ─────────────────
  const burnoutRisks = activeMembers.filter(m => {
    if (!m.weekly_hours || m.weekly_hours === 0) return false
    return [1, 2, 3].every(weeksAgo => {
      const wStart = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), weeksAgo)
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1 })
      const billH = withEarnings.filter(e => e.user_id === m.user_id && e.billable && new Date(e.start_time) >= wStart && new Date(e.start_time) <= wEnd).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
      return billH / (m.weekly_hours ?? 40) > 1.0
    })
  })

  // ── Anomaly Detection ─────────────────────────────────────────────────────
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
    if (lastW > 200 && thisW > lastW * 2.5) anomalies.push({ message: `${p.name} — burn rate ${Math.round(thisW / lastW)}× vs last week (${formatMoney(thisW)} this week)`, severity: 'error' })
  })

  // ── Project burndown ─────────────────────────────────────────────────────
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
    const n = e.project?.client?.name || 'No client'; const c = e.project?.client?.color || e.project?.color || '#6366f1'
    if (!clientMap[n]) clientMap[n] = { name: n, color: c, revenue: 0 }
    clientMap[n].revenue += e.earnings
  })
  const clientData = Object.values(clientMap).sort((a, b) => b.revenue - a.revenue).slice(0, 6)

  // ── Cashflow (admin only) — billed/collected filtered by period; outstanding/overdue always all-time ─
  const today = now
  const inPeriod = (dateStr: string | null) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d >= periodBounds.from && d <= periodBounds.to
  }
  const cashflow = seeAll ? (() => {
    let billed = 0, paid = 0, open = 0, overdue = 0
    for (const inv of invoices) {
      const amount = Number(inv.subtotal) || 0
      // billed in period = sent or paid, where sent_at or created_at falls in range
      if ((inv.status === 'paid' || inv.status === 'sent') && inPeriod(inv.sent_at || inv.created_at)) billed += amount
      // collected in period = paid_at in range
      if (inv.status === 'paid' && inPeriod(inv.paid_at)) paid += amount
      // outstanding & overdue = always current (regardless of period)
      if (inv.status === 'sent') {
        if (new Date(inv.due_date) < today) overdue += amount
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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' && p.value > 100 ? formatMoney(p.value) : p.value}{p.name === 'hours' ? 'h' : ''}</p>
        ))}
      </div>
    )
  }

  const hasAlerts = burnoutRisks.length > 0 || anomalies.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('analyticsTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('analyticsSubtitle')}</p>
        </div>
        <select className="input w-auto text-xs py-1.5" value={period} onChange={e => setPeriod(e.target.value as any)}>
          <option value="this_week">{t('thisWeekLabel')}</option>
          <option value="this_month">{t('thisMonthLabel')}</option>
          <option value="last_month">{t('lastMonthLabel')}</option>
          <option value="last_3m">{t('last3Months')}</option>
        </select>
      </div>

      {/* ── Insights / Alerts ── */}
      {hasAlerts && (
        <div className="space-y-2">
          {burnoutRisks.map(m => (
            <div key={m.user_id} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-500">{t('burnoutRiskLabel')} — {m.full_name || m.email}</p>
                <p className="text-xs text-muted-foreground">{t('burnoutRiskDetail')}</p>
              </div>
            </div>
          ))}
          {anomalies.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${a.severity === 'error' ? 'bg-red-500/10 border border-red-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
              <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${a.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
              <p className={`text-xs ${a.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: `${t('revenueMTD')} · ${periodLabel}`, value: formatMoney(revenuePeriod), sub: revenueForecast ? `${t('forecastPrefix')}: ${formatMoney(revenueForecast)}` : t('billableOnly2'), icon: DollarSign, color: 'bg-emerald-500' },
          { label: t('pipelineRemaining'), value: formatMoney(pipeline), sub: t('acrossAllProjects'), icon: TrendingUp, color: 'bg-brand-600' },
          { label: t('teamUtilization'), value: `${utilization}%`, sub: `${periodLabel} · ${t('billableTotalHours')}`, icon: Users, color: 'bg-violet-500' },
          { label: t('avgEffectiveRate'), value: `${formatMoney(avgRate)}/h`, sub: `${periodLabel} · ${t('revenueDivBillable')}`, icon: Zap, color: 'bg-amber-500' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}><Icon className="w-4 h-4 text-white" /></div>
            <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Cashflow KPI (Partner only) ── */}
      {cashflow && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cashflow</h2>
            <span className="text-xs text-muted-foreground/50">· {t('cashflowHint')}: {periodLabel} · {t('cashflowHintOutstanding')}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: t('totalBilled'), value: formatMoney(cashflow.billed), color: 'bg-brand-600', sub: `${invoices.filter(i => (i.status === 'paid' || i.status === 'sent') && inPeriod(i.sent_at || i.created_at)).length} ${t('invoicesLabel')}` },
              { label: t('collectedLabel'), value: formatMoney(cashflow.paid), color: 'bg-emerald-500', sub: `${invoices.filter(i => i.status === 'paid' && inPeriod(i.paid_at)).length} ${t('paidLabel')}` },
              { label: t('outstandingLabel'), value: formatMoney(cashflow.open), color: 'bg-amber-500', sub: `${invoices.filter(i => i.status === 'sent' && new Date(i.due_date) >= today).length} ${t('invoicesLabel')}` },
              { label: t('overdueLabel'), value: formatMoney(cashflow.overdue), color: cashflow.overdue > 0 ? 'bg-red-500' : 'bg-muted-foreground/30', sub: `${invoices.filter(i => i.status === 'sent' && new Date(i.due_date) < today).length} ${t('pastDueLabel')}` },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-1 self-stretch rounded-full ${color}`} />
                <div>
                  <p className="text-lg font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground/50">{sub}</p>
                </div>
              </div>
            ))}
          </div>
          {cashflow.overdue > 0 && (
            <div className="mt-4 flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-500">
                <span className="font-semibold">{formatMoney(cashflow.overdue)} {t('overdueAlertSuffix')}</span> — {invoices.filter(i => i.status === 'sent' && new Date(i.due_date) < today).length} {t('overdueAlertBody')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Unified Team Utilization ── */}
      <div className="card p-5">
        {/* Header + controls */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {drillMember ? (
            <button onClick={() => setUtilMemberId('all')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> {t('allMembers')}
            </button>
          ) : (
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('teamUtilHeader')} <span className="font-normal normal-case">· {periodLabel}</span></h2>
          )}
          <div className="flex-1" />
          <select className="input w-auto text-xs py-1" value={utilMemberId} onChange={e => setUtilMemberId(e.target.value)}>
            <option value="all">{t('allMembers')}</option>
            {activeMembers.map(m => <option key={m.user_id!} value={m.user_id!}>{m.full_name || m.email}</option>)}
          </select>
        </div>

        {/* Overview: all members */}
        {!drillMember && (
          <div className="space-y-1">
            {teamUtilUnified.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 text-center py-6">No data for this period</p>
            ) : teamUtilUnified.map(row => (
              <button
                key={row.userId}
                onClick={() => row.userId && setUtilMemberId(row.userId)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors group text-left"
              >
                <div className="w-8 h-8 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 text-xs font-bold shrink-0">
                  {row.name[0].toUpperCase()}
                </div>
                <span className="text-xs font-medium text-foreground w-28 truncate shrink-0">{row.name}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${utilBarColor(row.pct)}`} style={{ width: `${Math.min(row.pct, 100)}%` }} />
                </div>
                <span className={`text-xs font-bold w-10 text-right tabular-nums ${utilBarColor(row.pct).replace('bg-', 'text-').replace('/40', '')}`}>{row.pct}%</span>
                <span className="text-xs text-muted-foreground w-24 text-right tabular-nums hidden sm:block">{row.billable}h / {row.capacity}h</span>
                <TrendPill delta={row.trend} />
                <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/30 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
            <p className="text-[10px] text-muted-foreground/40 text-right pt-2">{t('drillDownHint')}</p>
          </div>
        )}

        {/* Drill-down: specific member */}
        {drillMember && (() => {
          const row = teamUtilUnified.find(r => r.userId === drillMember.user_id)
          if (!row) return null
          return (
            <div className="space-y-5">
              {/* Summary tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: t('utilizationLabel'), value: `${row.pct}%`, sub: periodLabel, color: utilBarColor(row.pct).replace('bg-', 'text-').replace('/40','') },
                  { label: t('billableHours2'), value: `${row.billable}h`, sub: `${row.capacity}h ${t('capacityLabel')}` },
                  { label: t('earnings'), value: formatMoney(row.revenue), sub: t('billableOnly2') },
                  { label: t('nonBillable2'), value: `${row.nonBillable}h`, sub: t('internalOverhead') },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${color || 'text-foreground'}`}>{value}</p>
                    <p className="text-xs text-muted-foreground/60">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Week-by-week bar chart */}
              {drillWeekData.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('weekByWeekLabel')}</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={drillWeekData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
                      <ReferenceLine y={drillMember.weekly_hours ?? 40} stroke="var(--muted-foreground)" strokeDasharray="4 2" label={{ value: 'Capacity', fill: 'var(--muted-foreground)', fontSize: 9, position: 'insideTopRight' }} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]?.payload
                        return (
                          <div className="bg-card border border-border rounded-lg p-2.5 text-xs shadow-lg">
                            <p className="font-semibold text-foreground mb-1">{label}</p>
                            <p className="text-emerald-500">Billable: {d.billable}h</p>
                            <p className="text-muted-foreground">Capacity: {d.capacity}h</p>
                            <p className="text-brand-600 font-medium">{d.pct}% utilization</p>
                          </div>
                        )
                      }} />
                      <Bar dataKey="billable" name="Billable" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Project breakdown */}
              {drillProjectBreakdown.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('timeByProject')}</p>
                  <div className="space-y-2">
                    {drillProjectBreakdown.map((p, i) => {
                      const maxH = drillProjectBreakdown[0].billable
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-xs text-foreground truncate w-36 shrink-0">{p.name}</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${maxH > 0 ? (p.billable / maxH) * 100 : 0}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{p.billable.toFixed(1)}h</span>
                          <span className="text-xs text-emerald-600 tabular-nums w-20 text-right">{formatMoney(p.revenue)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── Revenue trend + Client pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('revenueHours6mo')}</h2>
            {revenueForecast && (
              <span className="text-xs bg-brand-500/10 text-brand-600 px-2 py-0.5 rounded-full font-medium">
                {t('forecastPrefix')}: {formatMoney(revenueForecast)} {t('thisMonthLabel').toLowerCase()}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueTrend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="hrs" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="rev" dataKey="revenue" name="Revenue (€)" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="hrs" dataKey="hours" name="hours" fill="#0ea5e9" radius={[4, 4, 0, 0]} opacity={0.6} />
              {revenueTrend.some(r => r.forecast) && (
                <Bar yAxisId="rev" dataKey="forecast" name="Forecast" fill="#6366f1" radius={[4, 4, 0, 0]} opacity={0.25} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t('revenueByClient')}</h2>
          {clientData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-xs">{t('noBillableData')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={clientData} cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="revenue">
                  {clientData.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [formatMoney(v), 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, backgroundColor: 'var(--card)', color: 'var(--card-foreground)' }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span className="text-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Project burndown ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('budgetBurndown')}</h2>
          <select className="input w-auto text-xs py-1" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="all">{t('selectProject')}</option>
            {scopedProjects.filter(p => p.budget_amount).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {selectedProject === 'all' ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-sm">{t('selectProjectHint')}</div>
        ) : burndownData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-sm">{t('noBillableEntriesProject')}</div>
        ) : (
          <>
            {burndownProject && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {(() => {
                  const spent = burndownEntries.reduce((s, e) => s + e.earnings, 0)
                  const budget = burndownProject.budget_amount || 0
                  const remaining = Math.max(0, budget - spent)
                  const pct = budget > 0 ? Math.round(spent / budget * 100) : 0
                  const hoursSpent = entries.filter(e => e.project_id === burndownProject.id).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
                  const burnPerDay = burndownData.length > 1 ? spent / Math.max(1, differenceInDays(new Date(), parseISO(burndownEntries[0]?.start_time?.split('T')[0])) || 1) : 0
                  const daysToComplete = burnPerDay > 0 && remaining > 0 ? Math.ceil(remaining / burnPerDay) : null
                  return (
                    <>
                      <div className={`rounded-lg p-3 border ${healthBg(pct)}`}>
                        <p className="text-xs text-muted-foreground">{t('budgetUsed')}</p>
                        <p className={`text-lg font-bold ${healthColor(pct)}`}>{pct}%</p>
                        <p className="text-xs text-muted-foreground">{formatMoney(spent)} {t('ofBudget')} {formatMoney(budget)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">{t('remaining')}</p>
                        <p className="text-lg font-bold text-foreground">{formatMoney(remaining)}</p>
                        <p className="text-xs text-muted-foreground">{formatDuration(Math.round((remaining / (spent / Math.max(hoursSpent, 0.1))) * 3600))} est.</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">{t('hoursLogged')}</p>
                        <p className="text-lg font-bold text-foreground">{hoursSpent.toFixed(1)}h</p>
                        {burndownProject.budget_hours && <p className="text-xs text-muted-foreground">{t('ofBudget')} {burndownProject.budget_hours}h</p>}
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">{t('estCompletion')}</p>
                        <p className="text-lg font-bold text-foreground">{daysToComplete ? `${daysToComplete}d` : '—'}</p>
                        <p className="text-xs text-muted-foreground">{burnPerDay > 0 ? `${formatMoney(burnPerDay)}${t('dayBurn')}` : t('noData')}</p>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={burndownData}>
                <defs>
                  <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatMoney(v), '']} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, backgroundColor: 'var(--card)', color: 'var(--card-foreground)' }} />
                {burndownProject?.budget_amount && <ReferenceLine y={burndownProject.budget_amount} stroke="#ef4444" strokeDasharray="6 3" label={{ value: 'Budget', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />}
                <Area type="monotone" dataKey="spent" name="Spent" stroke="#6366f1" strokeWidth={2} fill="url(#spentGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* ── Project health (full width) ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('projectHealth')}</h2>
        </div>
        {projectHealth.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-xs">{t('noProjectsWithBudgets')}</div>
        ) : (
          <div className="divide-y divide-border">
            {projectHealth.map(({ p, spent, hoursSpent, budgetPct, hoursPct, worstPct }) => (
              <div key={p.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.client?.name || '—'}</p>
                </div>
                <div className="text-right shrink-0">
                  {budgetPct !== null && <p className={`text-xs font-semibold ${healthColor(budgetPct)}`}>{formatMoney(spent)} / {formatMoney(p.budget_amount)}</p>}
                  {hoursPct !== null && <p className={`text-xs ${healthColor(hoursPct)}`}>{hoursSpent.toFixed(1)}h / {p.budget_hours}h</p>}
                  {budgetPct === null && hoursPct === null && <p className="text-xs text-muted-foreground/50">{t('noBudgetSet')}</p>}
                </div>
                <HealthIcon pct={worstPct} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
