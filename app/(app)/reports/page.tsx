'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { formatDuration, formatMoney } from '@/lib/types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, parseISO } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { Download, Clock, TrendingUp, DollarSign } from 'lucide-react'

type Range = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'

function getRange(range: Range, custom: { from: string; to: string }) {
  const now = new Date()
  switch (range) {
    case 'this_week':  return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) }
    case 'last_week':  { const s = new Date(startOfWeek(now, { weekStartsOn: 1 })); s.setDate(s.getDate() - 7); const e = new Date(s); e.setDate(e.getDate() + 6); return { from: s, to: e } }
    case 'this_month': return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'last_month': { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) } }
    case 'custom':     return { from: custom.from ? new Date(custom.from) : startOfMonth(now), to: custom.to ? new Date(custom.to) : endOfMonth(now) }
  }
}

export default function ReportsPage() {
  const supabase = createClient()
  const { workspaceId, role, members, effectiveUserId, isProjectManager } = useWorkspace()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? de : enUS
  const [range, setRange] = useState<Range>('this_month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'entries'>('overview')

  const load = useCallback(async () => {
    setLoading(true)
    if (!workspaceId) return
    const { from, to } = getRange(range, custom)
    const toEnd = new Date(to); toEnd.setHours(23, 59, 59)
    let query = supabase.from('time_entries').select('*, project:projects(*, client:clients(*))')
      .eq('workspace_id', workspaceId).not('end_time', 'is', null)
      .gte('start_time', from.toISOString()).lte('start_time', toEnd.toISOString())
      .order('start_time', { ascending: true })
    if (role === 'member' && !isProjectManager) query = query.eq('user_id', effectiveUserId)
    const { data } = await query
    setEntries(data || [])
    setLoading(false)
  }, [supabase, workspaceId, role, effectiveUserId, range, custom])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const totalSecs = entries.reduce((s, e) => s + (e.duration_sec || 0), 0)
  const billableSecs = entries.filter(e => e.billable).reduce((s, e) => s + (e.duration_sec || 0), 0)
  const totalEarnings = entries.filter(e => e.billable).reduce((s, e) => s + ((e.duration_sec || 0) / 3600) * (e.hourly_rate || 0), 0)

  const { from: fromDate, to: toDate } = getRange(range, custom)
  const days = eachDayOfInterval({ start: fromDate, end: toDate })
  const dailyMap: Record<string, number> = {}
  entries.forEach(e => { const d = format(parseISO(e.start_time), 'yyyy-MM-dd'); dailyMap[d] = (dailyMap[d] || 0) + (e.duration_sec || 0) })
  const dailyData = days.map(d => ({ date: format(d, 'MMM d', { locale: dateFnsLocale }), hours: parseFloat(((dailyMap[format(d, 'yyyy-MM-dd')] || 0) / 3600).toFixed(2)) }))

  const projectMap: Record<string, { name: string; color: string; secs: number }> = {}
  entries.forEach(e => {
    const pId = e.project_id || 'none'
    if (!projectMap[pId]) projectMap[pId] = { name: e.project?.name || t('noProject'), color: e.project?.color || '#e5e7eb', secs: 0 }
    projectMap[pId].secs += e.duration_sec || 0
  })
  const pieData = Object.values(projectMap).map(p => ({ name: p.name, value: parseFloat((p.secs / 3600).toFixed(2)), color: p.color }))

  const teamMap: Record<string, { secs: number; billableSecs: number; earnings: number; projects: Set<string>; byProject: Record<string, number> }> = {}
  entries.forEach(e => {
    if (!teamMap[e.user_id]) teamMap[e.user_id] = { secs: 0, billableSecs: 0, earnings: 0, projects: new Set(), byProject: {} }
    teamMap[e.user_id].secs += e.duration_sec || 0
    teamMap[e.user_id].projects.add(e.project_id || 'none')
    const projName = e.project?.name || t('noProject')
    teamMap[e.user_id].byProject[projName] = (teamMap[e.user_id].byProject[projName] || 0) + (e.duration_sec || 0)
    if (e.billable) { teamMap[e.user_id].billableSecs += e.duration_sec || 0; teamMap[e.user_id].earnings += ((e.duration_sec || 0) / 3600) * (e.hourly_rate || 0) }
  })
  const teamRows = Object.entries(teamMap).sort((a, b) => b[1].secs - a[1].secs).map(([userId, data]) => ({ userId, member: members.find(m => m.user_id === userId), ...data }))

  function exportCSV() {
    const rows = [
      ['Date', 'Description', 'Project', 'Client', 'Member', 'Duration (h)', 'Billable', 'Earnings (EUR)'],
      ...entries.map(e => {
        const member = members.find(m => m.user_id === e.user_id)
        return [format(parseISO(e.start_time), 'yyyy-MM-dd'), e.description || '', e.project?.name || '', e.project?.client?.name || '', member?.full_name || member?.email || e.user_id, ((e.duration_sec || 0) / 3600).toFixed(2), e.billable ? 'Yes' : 'No', e.billable ? (((e.duration_sec || 0) / 3600) * (e.hourly_rate || 0)).toFixed(2) : '0']
      })
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `kairos-report-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-card border border-border rounded-lg p-2.5 text-xs shadow-lg">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} className="text-foreground">{p.value}h</p>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('reportsTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{role === 'admin' || isProjectManager ? t('teamAnalysis') : t('yourAnalysis')}</p>
        </div>
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
          <Download className="w-3.5 h-3.5" /> {t('exportCSV')}
        </button>
      </div>

      {/* Range picker */}
      <div className="card p-3 mb-5 flex items-center gap-3 flex-wrap">
        <div className="flex gap-0.5 bg-muted p-0.5 rounded-lg">
          {([['this_week', t('thisWeekLabel')], ['this_month', t('thisMonthLabel')], ['last_month', t('lastMonthLabel')], ['custom', t('custom')]] as [Range, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setRange(v)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${range === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input w-auto text-xs" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
            <span className="text-muted-foreground/50">–</span>
            <input type="date" className="input w-auto text-xs" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: t('totalTracked'), value: formatDuration(totalSecs), icon: Clock, color: 'text-brand-600 bg-brand-600/10' },
          { label: t('billable'), value: formatDuration(billableSecs), icon: TrendingUp, color: 'text-violet-600 bg-violet-500/10' },
          { label: t('nonBillable'), value: formatDuration(totalSecs - billableSecs), icon: Clock, color: 'text-muted-foreground bg-muted' },
          { label: t('earnings'), value: formatMoney(totalEarnings), icon: DollarSign, color: 'text-emerald-600 bg-emerald-500/10' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className={`inline-flex p-1.5 rounded-lg ${color} mb-2`}><Icon className="w-3.5 h-3.5" /></div>
            <p className="text-lg font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-muted p-0.5 rounded-lg w-fit mb-5">
        {[['overview', t('overview')], ...(role === 'admin' || isProjectManager ? [['team', t('team')]] : []), ['entries', t('entries')]].map(([v, label]) => (
          <button key={v} onClick={() => setActiveTab(v as any)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="card p-5 lg:col-span-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t('dailyHours')}</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyData} barSize={days.length > 14 ? 6 : 16}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="hours" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card p-5">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t('byProject')}</h2>
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-xs">{t('noData')}</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                          {pieData.map((p, i) => <Cell key={i} fill={p.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => [`${v}h`, '']} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 11, backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-3 space-y-1.5">
                      {pieData.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-xs text-foreground truncate flex-1">{p.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{p.value}h</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'team' && role === 'admin' && (
            <div className="space-y-4">
              {teamRows.length === 0 ? (
                <div className="card px-6 py-16 text-center"><p className="text-sm text-muted-foreground">{t('noTimeTracked')}</p></div>
              ) : teamRows.map(row => {
                const name = row.member?.full_name || row.member?.email || 'Unknown'
                const billablePct = row.secs > 0 ? Math.round(row.billableSecs / row.secs * 100) : 0
                const topProjects = Object.entries(row.byProject).sort((a, b) => b[1] - a[1]).slice(0, 3)
                return (
                  <div key={row.userId} className="card p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 font-bold text-sm flex-shrink-0">{name[0].toUpperCase()}</div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{name}</p>
                          {row.member?.full_name && <p className="text-xs text-muted-foreground">{row.member.email}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-foreground tabular-nums">{formatDuration(row.secs)}</p>
                        <p className="text-xs text-muted-foreground">{t('totalHours')}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-0.5">{t('billable')}</p>
                        <p className="text-sm font-semibold text-foreground">{formatDuration(row.billableSecs)}</p>
                        <p className="text-xs text-brand-600 font-medium mt-0.5">{billablePct}%</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-0.5">{t('earnings')}</p>
                        <p className="text-sm font-semibold text-emerald-600">{formatMoney(row.earnings)}</p>
                        <p className="text-xs text-muted-foreground/50 mt-0.5">{t('billableOnly')}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-0.5">{t('projects')}</p>
                        <p className="text-sm font-semibold text-foreground">{row.projects.size}</p>
                      </div>
                    </div>
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{t('billableRatio')}</span><span>{billablePct}%</span></div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${billablePct}%` }} /></div>
                    </div>
                    {topProjects.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">{t('timeByProject')}</p>
                        <div className="space-y-1.5">
                          {topProjects.map(([projName, secs]) => {
                            const pct = Math.round((secs / row.secs) * 100)
                            return (
                              <div key={projName} className="flex items-center gap-2">
                                <p className="text-xs text-muted-foreground w-32 truncate flex-shrink-0">{projName}</p>
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                                <p className="text-xs font-mono text-muted-foreground w-14 text-right flex-shrink-0">{formatDuration(secs)}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'entries' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">{t('date')}</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">{t('description')}</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">{t('projects')}</th>
                      {role === 'admin' && <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">{t('member')}</th>}
                      <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">{t('duration')}</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">{t('earnings')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-xs text-muted-foreground">{t('noEntriesPeriod')}</td></tr>
                    ) : entries.map(e => {
                      const earnings = e.billable ? (((e.duration_sec || 0) / 3600) * (e.hourly_rate || 0)) : 0
                      const member = members.find(m => m.user_id === e.user_id)
                      return (
                        <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">{format(parseISO(e.start_time), 'MMM d, yyyy', { locale: dateFnsLocale })}</td>
                          <td className="px-5 py-3 text-xs text-foreground max-w-xs truncate">{e.description || <span className="text-muted-foreground/50 italic">—</span>}</td>
                          <td className="px-5 py-3">
                            {e.project ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.project.color }} />{e.project.name}</span> : <span className="text-xs text-muted-foreground/50">—</span>}
                          </td>
                          {role === 'admin' && <td className="px-5 py-3 text-xs text-muted-foreground">{member?.full_name || member?.email || '—'}</td>}
                          <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{e.duration_sec ? formatDuration(e.duration_sec) : '—'}</td>
                          <td className="px-5 py-3 text-right text-xs font-medium text-emerald-600">{earnings > 0 ? formatMoney(earnings) : <span className="text-muted-foreground/50">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {entries.length > 0 && (
                    <tfoot className="border-t border-border bg-muted/30">
                      <tr>
                        <td colSpan={role === 'admin' ? 4 : 3} className="px-5 py-3 text-xs font-semibold text-muted-foreground">{t('total')} — {entries.length} {t('entries').toLowerCase()}</td>
                        <td className="px-5 py-3 text-right font-mono font-bold text-xs text-foreground">{formatDuration(totalSecs)}</td>
                        <td className="px-5 py-3 text-right font-bold text-xs text-emerald-600">{formatMoney(totalEarnings)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
