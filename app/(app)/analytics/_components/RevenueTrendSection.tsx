'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { CartesianGrid } from 'recharts'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { CustomTooltip } from '../_lib/utils'

type RevMonth = { month: string; revenue: number; hours: number; forecast?: number }
type ClientData = { name: string; color: string; revenue: number }

export function RevenueTrendSection({ revenueTrend, clientData, revenueForecast }: {
  revenueTrend: RevMonth[]
  clientData: ClientData[]
  revenueForecast: number | null
}) {
  const { t } = useI18n()

  return (
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
            <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
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
              <Tooltip formatter={(v) => [formatMoney(Number(v ?? 0)), 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, backgroundColor: 'var(--card)', color: 'var(--card-foreground)' }} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span className="text-foreground">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
