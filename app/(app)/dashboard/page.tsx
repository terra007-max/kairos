'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { formatDuration, formatMoney } from '@/lib/types'
import { Clock, TrendingUp, Briefcase, Activity, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { startOfWeek, startOfMonth, subWeeks, subMonths, formatDistanceToNow } from 'date-fns'
import { de, enGB } from 'date-fns/locale'
import Link from 'next/link'

function SkeletonCard() {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-3 w-16" />
        </div>
        <div className="skeleton w-10 h-10 rounded-xl" />
      </div>
    </div>
  )
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="trend-neutral"><Minus className="w-3 h-3" />—</span>
  if (previous === 0) return <span className="trend-up"><ArrowUpRight className="w-3 h-3" />New</span>
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct > 0) return <span className="trend-up"><ArrowUpRight className="w-3 h-3" />+{pct}%</span>
  if (pct < 0) return <span className="trend-down"><ArrowDownRight className="w-3 h-3" />{pct}%</span>
  return <span className="trend-neutral"><Minus className="w-3 h-3" />0%</span>
}

function StatCard({ label, value, sub, icon: Icon, color, current, previous }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string; current: number; previous: number
}) {
  return (
    <div className="card p-6 hover:shadow-card-hover transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <TrendBadge current={current} previous={previous} />
      </div>
      <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-300 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createClient()
  const { workspaceId, role, members } = useWorkspace()
  const { t, locale } = useI18n()
  const [stats, setStats] = useState({ weekSecs: 0, monthSecs: 0, earnings: 0, projects: 0, clients: 0, prevWeekSecs: 0, prevMonthSecs: 0, prevEarnings: 0 })
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const dateLocale = locale === 'de' ? de : enGB

  const load = useCallback(async () => {
    if (!workspaceId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const monthStart = startOfMonth(now)
    const prevWeekStart = subWeeks(weekStart, 1)
    const prevMonthStart = startOfMonth(subMonths(now, 1))
    const prevMonthEnd = new Date(monthStart.getTime() - 1)
    const prevWeekEnd = new Date(weekStart.getTime() - 1)
    const userFilter = role === 'member' ? { user_id: user.id } : {}

    const [{ data: week }, { data: month }, { data: prevWeek }, { data: prevMonth }, { data: recentData }, { data: projects }, { data: clients }] = await Promise.all([
      supabase.from('time_entries').select('duration_sec, billable, project_id').eq('workspace_id', workspaceId).match(userFilter).gte('start_time', weekStart.toISOString()).not('end_time', 'is', null),
      supabase.from('time_entries').select('duration_sec, billable, project_id').eq('workspace_id', workspaceId).match(userFilter).gte('start_time', monthStart.toISOString()).not('end_time', 'is', null),
      supabase.from('time_entries').select('duration_sec').eq('workspace_id', workspaceId).match(userFilter).gte('start_time', prevWeekStart.toISOString()).lte('start_time', prevWeekEnd.toISOString()).not('end_time', 'is', null),
      supabase.from('time_entries').select('duration_sec, billable, project_id').eq('workspace_id', workspaceId).match(userFilter).gte('start_time', prevMonthStart.toISOString()).lte('start_time', prevMonthEnd.toISOString()).not('end_time', 'is', null),
      supabase.from('time_entries').select('*, project:projects(*, client:clients(*))').eq('workspace_id', workspaceId).match(userFilter).order('start_time', { ascending: false }).limit(8),
      supabase.from('projects').select('id, hourly_rate').eq('workspace_id', workspaceId).eq('status', 'active'),
      supabase.from('clients').select('id').eq('workspace_id', workspaceId),
    ])

    const pMap = Object.fromEntries((projects || []).map(p => [p.id, p]))
    const calcEarnings = (entries: any[]) => entries.filter(e => e.billable).reduce((s, e) => {
      const p = pMap[e.project_id]
      return s + (p?.hourly_rate ? (e.duration_sec || 0) / 3600 * p.hourly_rate : 0)
    }, 0)

    setStats({
      weekSecs: (week || []).reduce((s, e) => s + (e.duration_sec || 0), 0),
      monthSecs: (month || []).reduce((s, e) => s + (e.duration_sec || 0), 0),
      earnings: calcEarnings(month || []),
      projects: projects?.length || 0,
      clients: clients?.length || 0,
      prevWeekSecs: (prevWeek || []).reduce((s, e) => s + (e.duration_sec || 0), 0),
      prevMonthSecs: (prevMonth || []).reduce((s, e) => s + (e.duration_sec || 0), 0),
      prevEarnings: calcEarnings(prevMonth || []),
    })
    setRecent(recentData || [])
    setLoading(false)
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

  const todayFormatted = new Date().toLocaleDateString(
    locale === 'de' ? 'de-AT' : 'en-GB',
    { weekday: 'long', month: 'long', day: 'numeric' }
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">{t('dashboard')}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {role === 'admin' ? t('teamOverview') : t('yourOverview')} · {todayFormatted}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <StatCard label={t('thisWeek')} value={formatDuration(stats.weekSecs)} sub={role === 'admin' ? t('teamHours') : t('yourHours')} icon={Clock} color="bg-brand-600" current={stats.weekSecs} previous={stats.prevWeekSecs} />
            <StatCard label={t('thisMonth')} value={formatDuration(stats.monthSecs)} sub={role === 'admin' ? t('teamHours') : t('yourHours')} icon={TrendingUp} color="bg-violet-500" current={stats.monthSecs} previous={stats.prevMonthSecs} />
            <StatCard label={t('monthlyEarnings')} value={formatMoney(stats.earnings)} sub={t('billableOnly')} icon={Activity} color="bg-emerald-500" current={stats.earnings} previous={stats.prevEarnings} />
            <StatCard label={t('activeProjects')} value={String(stats.projects)} sub={`${stats.clients} ${t('clients')}`} icon={Briefcase} color="bg-amber-500" current={stats.projects} previous={stats.projects} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">{t('recentEntries')}</h2>
            <Link href="/timer" className="text-xs text-brand-600 hover:text-brand-700 font-medium">{t('viewAll')}</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              [1,2,3,4].map(i => (
                <div key={i} className="px-5 py-4 flex items-center gap-4">
                  <div className="skeleton w-2.5 h-2.5 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-48" />
                    <div className="skeleton h-3 w-32" />
                  </div>
                  <div className="skeleton h-4 w-16" />
                </div>
              ))
            ) : recent.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-400">{t('noEntriesYet')}</p>
                <p className="text-xs text-gray-300 mt-1">{t('startTimerHint')}</p>
                <Link href="/timer" className="mt-4 inline-flex btn-primary">{t('startTracking')}</Link>
              </div>
            ) : recent.map((entry: any) => (
              <div key={entry.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.project?.color || '#e5e7eb' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {entry.description || <span className="text-gray-400 italic">{t('noDescription')}</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {entry.project?.name || t('noProject')} · {formatDistanceToNow(new Date(entry.start_time), { addSuffix: true, locale: dateLocale })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-2">
                  {entry.billable && <span className="text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">{t('billable')}</span>}
                  <p className="text-sm font-mono font-medium text-gray-700 tabular-nums">
                    {entry.duration_sec ? formatDuration(entry.duration_sec) : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team status — admin only */}
        {role === 'admin' && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Team status</h2>
              <span className="text-xs text-gray-400">{new Date().toLocaleTimeString(locale === 'de' ? 'de-AT' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <TeamStatus workspaceId={workspaceId} members={members} supabase={supabase} />
          </div>
        )}
      </div>
    </div>
  )
}

function TeamStatus({ workspaceId, members, supabase }: { workspaceId: string; members: any[]; supabase: any }) {
  const [statuses, setStatuses] = useState<Record<string, any>>({})

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('time_entries')
        .select('user_id, start_time, project:projects(name, color)')
        .eq('workspace_id', workspaceId)
        .is('end_time', null)
      const map: Record<string, any> = {}
      for (const d of data || []) map[d.user_id] = d
      setStatuses(map)
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [workspaceId])

  const activeMembers = members.filter(m => m.status === 'active')

  if (activeMembers.length === 0) return (
    <div className="px-5 py-8 text-center text-xs text-gray-400">No team members yet.</div>
  )

  return (
    <div className="divide-y divide-gray-50">
      {activeMembers.map(m => {
        const running = statuses[m.user_id || '']
        const name = m.full_name || m.email
        const elapsed = running ? Math.floor((Date.now() - new Date(running.start_time).getTime()) / 1000) : 0
        return (
          <div key={m.id} className="px-5 py-3.5 flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">
                {name[0].toUpperCase()}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${running ? 'bg-emerald-400' : 'bg-gray-300'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{name}</p>
              {running ? (
                <p className="text-xs text-gray-400 truncate">
                  <span className="text-emerald-500 font-medium">● Tracking</span>
                  {running.project?.name && ` · ${running.project.name}`}
                </p>
              ) : (
                <p className="text-xs text-gray-400">Not tracking</p>
              )}
            </div>
            {running && (
              <span className="font-mono text-xs font-semibold text-emerald-600 tabular-nums">
                {String(Math.floor(elapsed / 3600)).padStart(2,'0')}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2,'0')}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}