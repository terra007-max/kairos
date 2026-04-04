'use client'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'

type RevMonth = { month: string; revenue: number; hours: number; forecast?: number }
type ClientData = { name: string; color: string; revenue: number }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-xs shadow-xl min-w-[160px]">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{p.name}</span>
          <span style={{ color: p.color }} className="font-medium">
            {p.dataKey === 'revenue' || p.dataKey === 'forecast'
              ? formatMoney(p.value)
              : `${p.value}h`}
          </span>
        </div>
      ))}
    </div>
  )
}

export function RevenueTrendSection({
  revenueTrend, clientData, revenueForecast, periodLabel,
}: {
  revenueTrend: RevMonth[]
  clientData: ClientData[]
  revenueForecast: number | null
  periodLabel: string
}) {
  const { t } = useI18n()
  const totalClientRev = clientData.reduce((s, c) => s + c.revenue, 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

      {/* Revenue + hours trend (6mo rolling) */}
      <div className="card p-5 lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('revenueHours6mo')}</h2>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">6-month rolling · all billable entries</p>
          </div>
          {revenueForecast && (
            <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full font-medium border border-emerald-500/20">
              {formatMoney(revenueForecast)} forecast
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={revenueTrend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="hrsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
            <YAxis yAxisId="hrs" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
            <Tooltip content={<CustomTooltip />} />
            <Area yAxisId="rev" type="monotone" dataKey="revenue" name={`${t('earnings')} (€)`} stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }} />
            <Area yAxisId="hrs" type="monotone" dataKey="hours" name={t('hours')} stroke="#0ea5e9" strokeWidth={1.5} fill="url(#hrsGrad)" dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
            {revenueTrend.some(r => r.forecast) && (
              <Area yAxisId="rev" type="monotone" dataKey="forecast" name="Forecast" stroke="#6366f1" strokeWidth={1.5} fill="none" strokeDasharray="5 3" dot={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-5 mt-2 justify-end">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-3 h-0.5 bg-indigo-500 inline-block" /> {t('earnings')}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-3 border-t border-dashed border-sky-400 inline-block" /> {t('hours')}
          </span>
        </div>
      </div>

      {/* Client revenue breakdown (period-filtered) */}
      <div className="card p-5 lg:col-span-2">
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('revenueByClient')}</h2>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">{periodLabel} · billable only</p>
        </div>

        {clientData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-xs">{t('noBillableData')}</div>
        ) : (
          <div className="space-y-3">
            {/* Mini donut + legend */}
            <div className="flex items-center gap-4">
              <div className="shrink-0">
                <ResponsiveContainer width={88} height={88}>
                  <PieChart>
                    <Pie
                      data={clientData}
                      cx="50%" cy="50%"
                      innerRadius={26} outerRadius={40}
                      paddingAngle={2}
                      dataKey="revenue"
                      strokeWidth={0}
                    >
                      {clientData.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {clientData.slice(0, 4).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-[11px] text-foreground truncate flex-1">{c.name}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {totalClientRev > 0 ? Math.round(c.revenue / totalClientRev * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Full list */}
            <div className="border-t border-border pt-3 space-y-2">
              {clientData.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${totalClientRev > 0 ? (c.revenue / clientData[0].revenue) * 100 : 0}%`,
                        backgroundColor: c.color,
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-foreground truncate w-24 shrink-0">{c.name}</span>
                  <span className="text-[11px] font-medium text-foreground tabular-nums shrink-0">{formatMoney(c.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
