'use client'
import { ChevronLeft } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { utilBarColor, TrendPill } from '../_lib/utils'

type TeamUtilRow = {
  userId: string | null
  name: string
  billable: number
  nonBillable: number
  revenue: number
  capacity: number
  pct: number
  trend: number
}

type DrillWeekData = { week: string; billable: number; capacity: number; pct: number }
type DrillProjectData = { name: string; billable: number; revenue: number; color: string }
type MemberLike = { user_id: string | null; full_name?: string | null; weekly_hours?: number | null }

export function TeamUtilizationSection({ teamUtilUnified, drillMember, drillWeekData, drillProjectBreakdown, utilMemberId, setUtilMemberId, activeMembers, periodLabel }: {
  teamUtilUnified: TeamUtilRow[]
  drillMember: MemberLike | undefined
  drillWeekData: DrillWeekData[]
  drillProjectBreakdown: DrillProjectData[]
  utilMemberId: string
  setUtilMemberId: (id: string) => void
  activeMembers: MemberLike[]
  periodLabel: string
}) {
  const { t } = useI18n()

  return (
    <div className="card p-5">
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
          {activeMembers.map(m => <option key={m.user_id!} value={m.user_id!}>{(m as { full_name?: string | null; email?: string | null }).full_name || (m as { email?: string | null }).email}</option>)}
        </select>
      </div>

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

      {drillMember && (() => {
        const row = teamUtilUnified.find(r => r.userId === drillMember.user_id)
        if (!row) return null
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t('utilizationLabel'), value: `${row.pct}%`, sub: periodLabel, color: utilBarColor(row.pct).replace('bg-', 'text-').replace('/40', '') },
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

            {drillWeekData.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('weekByWeekLabel')}</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={drillWeekData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
                    <ReferenceLine y={drillMember.weekly_hours ?? 40} stroke="var(--muted-foreground)" strokeDasharray="4 2" label={{ value: 'Capacity', fill: 'var(--muted-foreground)', fontSize: 9, position: 'insideTopRight' }} />
                    <Tooltip content={({ active, payload, label: l }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]?.payload
                      return (
                        <div className="bg-card border border-border rounded-lg p-2.5 text-xs shadow-lg">
                          <p className="font-semibold text-foreground mb-1">{l}</p>
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
  )
}
