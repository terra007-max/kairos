'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { formatDuration, formatMoney, calcEntryEarnings } from '@/lib/types'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ReferenceLine, CartesianGrid
} from 'recharts'
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, parseISO, differenceInDays, startOfWeek, endOfWeek, subWeeks } from 'date-fns'
import { TrendingUp, DollarSign, Users, Zap, AlertTriangle, CheckCircle, XCircle, Lock } from 'lucide-react'

const WORK_HOURS_PER_DAY = 8

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
function HealthIcon({ pct }: { pct: number }) {
  if (pct >= 100) return <XCircle className="w-4 h-4 text-red-500" />
  if (pct >= 80) return <AlertTriangle className="w-4 h-4 text-amber-500" />
  return <CheckCircle className="w-4 h-4 text-emerald-500" />
}

export default function AnalyticsPage() {
  const supabase = createClient()
  const { workspaceId, role, members } = useWorkspace()
  const { t } = useI18n()
  const [entries, setEntries] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [utilMemberId, setUtilMemberId] = useState<string>('all')
  const [utilRange, setUtilRange] = useState<'this_week' | 'last_week' | 'this_month' | 'last_month'>('this_month')

  const load = useCallback(async () => {
    if (!workspaceId) return
    const sixMonthsAgo = subMonths(new Date(), 6)

    const [{ data: entriesData }, { data: projectsData }] = await Promise.all([
      supabase.from('time_entries')
        .select('*, hourly_rate, project:projects(*, client:clients(*), level_rates:project_level_rates(*))')
        .eq('workspace_id', workspaceId)
        .not('end_time', 'is', null)
        .gte('start_time', sixMonthsAgo.toISOString())
        .order('start_time', { ascending: true }),
      supabase.from('projects')
        .select('*, client:clients(*), level_rates:project_level_rates(*)')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active'),
    ])

    setEntries(entriesData || [])
    setProjects(projectsData || [])
    setLoading(false)
  }, [supabase, workspaceId])

  useEffect(() => { load() }, [load])

  if (role !== 'admin') return (
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

  // ── Compute earnings per entry (use snapshotted hourly_rate if available) ──
  const withEarnings = entries.map(e => ({
    ...e,
    earnings: e.duration_sec
      ? (e.hourly_rate > 0
          ? (e.duration_sec / 3600) * e.hourly_rate
          : calcEntryEarnings(e.duration_sec, e.project, e.level_id))
      : 0,
  }))

  // ── KPIs ────────────────────────────────────────────────────────────────
  const now = new Date()
  const monthStart = startOfMonth(now)
  const mtdEntries = withEarnings.filter(e => new Date(e.start_time) >= monthStart)
  const revenueMTD = mtdEntries.reduce((s, e) => s + (e.billable ? e.earnings : 0), 0)
  const totalHours = mtdEntries.reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
  const billableHours = mtdEntries.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
  // Capacity-based utilization: billable hours / contracted capacity so far this month
  const weeksElapsedMTD = Math.max((now.getTime() - monthStart.getTime()) / (7 * 24 * 3600 * 1000), 1 / 7)
  const activeMembers = members.filter(m => m.status === 'active')
  const totalCapacityMTD = activeMembers.reduce((s, m) => s + (m.weekly_hours ?? 40) * weeksElapsedMTD, 0)
  const utilization = totalCapacityMTD > 0 ? Math.round(billableHours / totalCapacityMTD * 100) : 0
  const avgRate = billableHours > 0 ? revenueMTD / billableHours : 0
  const pipeline = projects.reduce((s, p) => {
    const spent = withEarnings.filter(e => e.project_id === p.id && e.billable).reduce((a, e) => a + e.earnings, 0)
    return s + Math.max(0, (p.budget_amount || 0) - spent)
  }, 0)

  // ── Revenue trend (last 6 months) ───────────────────────────────────────
  const months = eachMonthOfInterval({ start: subMonths(now, 5), end: now })
  const revenueTrend = months.map(m => {
    const mStart = startOfMonth(m)
    const mEnd = endOfMonth(m)
    const rev = withEarnings
      .filter(e => e.billable && new Date(e.start_time) >= mStart && new Date(e.start_time) <= mEnd)
      .reduce((s, e) => s + e.earnings, 0)
    const hrs = withEarnings
      .filter(e => new Date(e.start_time) >= mStart && new Date(e.start_time) <= mEnd)
      .reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    return { month: format(m, 'MMM'), revenue: parseFloat(rev.toFixed(0)), hours: parseFloat(hrs.toFixed(1)) }
  })

  // ── Project burndown ────────────────────────────────────────────────────
  const burndownProject = selectedProject !== 'all' ? projects.find(p => p.id === selectedProject) : null
  const burndownEntries = burndownProject
    ? withEarnings.filter(e => e.project_id === burndownProject.id && e.billable)
    : []

  let cumulativeCost = 0
  const burndownData: { date: string; spent: number; budget: number | null; forecast?: number }[] = []
  if (burndownProject && burndownEntries.length > 0) {
    const sorted = [...burndownEntries].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const firstDate = new Date(sorted[0].start_time)
    const dayMap: Record<string, number> = {}
    sorted.forEach(e => {
      const d = format(parseISO(e.start_time), 'yyyy-MM-dd')
      dayMap[d] = (dayMap[d] || 0) + e.earnings
    })
    const sortedDays = Object.keys(dayMap).sort()
    sortedDays.forEach(day => {
      cumulativeCost += dayMap[day]
      burndownData.push({
        date: format(parseISO(day), 'MMM d'),
        spent: parseFloat(cumulativeCost.toFixed(0)),
        budget: burndownProject.budget_amount || null,
      })
    })

    // Add forecast point
    if (burndownData.length >= 2 && burndownProject.budget_amount) {
      const daysElapsed = differenceInDays(new Date(sortedDays[sortedDays.length - 1]), firstDate) || 1
      const burnPerDay = cumulativeCost / daysElapsed
      const remaining = burndownProject.budget_amount - cumulativeCost
      if (remaining > 0 && burnPerDay > 0) {
        const daysLeft = Math.ceil(remaining / burnPerDay)
        const forecastDate = new Date()
        forecastDate.setDate(forecastDate.getDate() + daysLeft)
        burndownData.push({
          date: `${format(forecastDate, 'MMM d')} (est.)`,
          spent: parseFloat(burndownProject.budget_amount.toFixed(0)),
          budget: burndownProject.budget_amount,
          forecast: parseFloat(burndownProject.budget_amount.toFixed(0)),
        })
      }
    }
  }

  // ── Team utilization ────────────────────────────────────────────────────
  const teamUtil = activeMembers.map(m => {
    const memberEntries = mtdEntries.filter(e => e.user_id === m.user_id)
    const billable = memberEntries.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const nonBillable = memberEntries.filter(e => !e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const rev = memberEntries.filter(e => e.billable).reduce((s, e) => s + e.earnings, 0)
    const capacity = (m.weekly_hours ?? 40) * weeksElapsedMTD
    return {
      name: (m.full_name || m.email || 'Unknown').split(' ')[0],
      billable: parseFloat(billable.toFixed(1)),
      nonBillable: parseFloat(nonBillable.toFixed(1)),
      revenue: rev,
      capacity: parseFloat(capacity.toFixed(1)),
      pct: capacity > 0 ? Math.round(billable / capacity * 100) : 0,
    }
  }).filter(m => m.billable + m.nonBillable > 0 || m.capacity > 0).sort((a, b) => b.billable - a.billable)

  // ── Per-member utilization lookup ───────────────────────────────────────
  const utilRangeBounds = (() => {
    const n = new Date()
    switch (utilRange) {
      case 'this_week':  { const s = startOfWeek(n, { weekStartsOn: 1 }); return { from: s, to: n, weeks: Math.max((n.getTime() - s.getTime()) / (7 * 24 * 3600 * 1000), 1 / 7) } }
      case 'last_week':  { const s = subWeeks(startOfWeek(n, { weekStartsOn: 1 }), 1); const e = endOfWeek(s, { weekStartsOn: 1 }); return { from: s, to: e, weeks: 1 } }
      case 'this_month': { const s = startOfMonth(n); return { from: s, to: n, weeks: Math.max((n.getTime() - s.getTime()) / (7 * 24 * 3600 * 1000), 1 / 7) } }
      case 'last_month': { const lm = subMonths(n, 1); const s = startOfMonth(lm); const e = endOfMonth(lm); return { from: s, to: e, weeks: (e.getTime() - s.getTime()) / (7 * 24 * 3600 * 1000) } }
    }
  })()
  const utilTargets = utilMemberId === 'all' ? activeMembers : activeMembers.filter(m => m.user_id === utilMemberId)
  const utilRows = utilTargets.map(m => {
    const mEntries = withEarnings.filter(e => e.user_id === m.user_id && new Date(e.start_time) >= utilRangeBounds.from && new Date(e.start_time) <= utilRangeBounds.to)
    const billable = mEntries.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const capacity = (m.weekly_hours ?? 40) * utilRangeBounds.weeks
    const pct = capacity > 0 ? Math.round(billable / capacity * 100) : 0
    return { name: m.full_name || m.email || 'Unknown', billable: parseFloat(billable.toFixed(1)), capacity: parseFloat(capacity.toFixed(1)), pct }
  }).sort((a, b) => b.pct - a.pct)

  // ── Client revenue ───────────────────────────────────────────────────────
  const clientMap: Record<string, { name: string; color: string; revenue: number }> = {}
  withEarnings.filter(e => e.billable).forEach(e => {
    const clientName = e.project?.client?.name || 'No client'
    const clientColor = e.project?.client?.color || e.project?.color || '#6366f1'
    if (!clientMap[clientName]) clientMap[clientName] = { name: clientName, color: clientColor, revenue: 0 }
    clientMap[clientName].revenue += e.earnings
  })
  const clientData = Object.values(clientMap).sort((a, b) => b.revenue - a.revenue).slice(0, 6)

  // ── Project health ───────────────────────────────────────────────────────
  const projectHealth = projects.map(p => {
    const spent = withEarnings.filter(e => e.project_id === p.id && e.billable).reduce((s, e) => s + e.earnings, 0)
    const hoursSpent = entries.filter(e => e.project_id === p.id).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
    const budgetPct = p.budget_amount ? Math.round(spent / p.budget_amount * 100) : null
    const hoursPct = p.budget_hours ? Math.round(hoursSpent / p.budget_hours * 100) : null
    const worstPct = Math.max(budgetPct ?? 0, hoursPct ?? 0)
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('analyticsTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('analyticsSubtitle')}</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('revenueMTD'), value: formatMoney(revenueMTD), sub: t('billableOnly2'), icon: DollarSign, color: 'bg-emerald-500' },
          { label: t('pipelineRemaining'), value: formatMoney(pipeline), sub: t('acrossAllProjects'), icon: TrendingUp, color: 'bg-brand-600' },
          { label: t('teamUtilization'), value: `${utilization}%`, sub: t('billableTotalHours'), icon: Users, color: 'bg-violet-500' },
          { label: t('avgEffectiveRate'), value: `${formatMoney(avgRate)}/h`, sub: t('revenueDivBillable'), icon: Zap, color: 'bg-amber-500' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Utilization lookup */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">Utilization lookup</h2>
          <select className="input w-auto text-xs py-1" value={utilMemberId} onChange={e => setUtilMemberId(e.target.value)}>
            <option value="all">All members</option>
            {activeMembers.map(m => <option key={m.user_id!} value={m.user_id!}>{m.full_name || m.email}</option>)}
          </select>
          <select className="input w-auto text-xs py-1" value={utilRange} onChange={e => setUtilRange(e.target.value as any)}>
            <option value="this_week">This week</option>
            <option value="last_week">Last week</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
          </select>
        </div>
        <div className="space-y-2">
          {utilRows.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 text-center py-4">No data for this period</p>
          ) : utilRows.map(row => (
            <div key={row.name} className="flex items-center gap-3">
              <span className="text-xs text-foreground w-32 truncate flex-shrink-0">{row.name}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${row.pct >= 90 ? 'bg-emerald-500' : row.pct >= 60 ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
                  style={{ width: `${Math.min(row.pct, 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-foreground w-10 text-right tabular-nums">{row.pct}%</span>
              <span className="text-xs text-muted-foreground w-28 text-right tabular-nums">{row.billable}h / {row.capacity}h</span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue trend + Project health */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Revenue trend */}
        <div className="card p-5 lg:col-span-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t('revenueHours6mo')}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueTrend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="hrs" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="rev" dataKey="revenue" name="Revenue (€)" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="hrs" dataKey="hours" name="hours" fill="#0ea5e9" radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Client revenue pie */}
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
                <Tooltip formatter={(v: number) => [formatMoney(v), 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 11, backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))' }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span className="text-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Project burndown */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('budgetBurndown')}</h2>
          <select className="input w-auto text-xs py-1" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="all">{t('selectProject')}</option>
            {projects.filter(p => p.budget_amount).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {selectedProject === 'all' ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-sm">
            {t('selectProjectHint')}
          </div>
        ) : burndownData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-sm">{t('noBillableEntriesProject')}</div>
        ) : (
          <>
            {/* Burndown stats */}
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
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatMoney(v), '']} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 11, backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))' }} />
                {burndownProject?.budget_amount && (
                  <ReferenceLine y={burndownProject.budget_amount} stroke="#ef4444" strokeDasharray="6 3" label={{ value: 'Budget', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                )}
                <Area type="monotone" dataKey="spent" name="Spent" stroke="#6366f1" strokeWidth={2} fill="url(#spentGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Team utilization + Project health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Team utilization */}
        <div className="card p-5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t('teamUtilizationMonth')}</h2>
          {teamUtil.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-xs">{t('noTrackedTimeMonth')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, teamUtil.length * 52)}>
              <BarChart data={teamUtil} layout="vertical" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
                      <p className="font-semibold text-foreground mb-1">{label}</p>
                      <p className="text-emerald-500">{t('billableLabel')}: {d.billable}h</p>
                      <p className="text-muted-foreground">{t('nonBillableLabel')}: {d.nonBillable}h</p>
                      <p className="text-muted-foreground/60">Capacity: {d.capacity}h</p>
                      <p className="text-brand-600 font-medium mt-1">{d.pct}% {t('utilizationLabel')}</p>
                      <p className="text-emerald-600">{formatMoney(d.revenue)}</p>
                    </div>
                  )
                }} />
                <Bar dataKey="billable" name={t('billableLabel')} stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="nonBillable" name={t('nonBillableLabel')} stackId="a" fill="hsl(var(--muted-foreground))" opacity={0.4} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Project health */}
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
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.client?.name || '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0 min-w-0">
                    {budgetPct !== null && (
                      <p className={`text-xs font-semibold ${healthColor(budgetPct)}`}>{formatMoney(spent)} / {formatMoney(p.budget_amount)}</p>
                    )}
                    {hoursPct !== null && (
                      <p className={`text-xs ${healthColor(hoursPct)}`}>{hoursSpent.toFixed(1)}h / {p.budget_hours}h</p>
                    )}
                    {budgetPct === null && hoursPct === null && (
                      <p className="text-xs text-muted-foreground/50">{t('noBudgetSet')}</p>
                    )}
                  </div>
                  <HealthIcon pct={worstPct} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
