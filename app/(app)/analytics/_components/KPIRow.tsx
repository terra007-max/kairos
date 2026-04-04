'use client'
import { DollarSign, TrendingUp, Users, Zap, TrendingDown, Minus } from 'lucide-react'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null || Math.abs(value) < 1) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
      <Minus className="w-2.5 h-2.5" /> {label}
    </span>
  )
  const up = value > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '+' : ''}{value}% {label}
    </span>
  )
}

export function KPIRow({ revenuePeriod, pipeline, utilization, avgRate, revenueForecast, periodLabel, prevRevenue, prevUtilization, prevAvgRate }: {
  revenuePeriod: number
  pipeline: number
  utilization: number
  avgRate: number
  revenueForecast: number | null
  periodLabel: string
  prevRevenue: number
  prevUtilization: number
  prevAvgRate: number
}) {
  const { t } = useI18n()

  const revDelta   = prevRevenue > 10     ? Math.round((revenuePeriod - prevRevenue)   / prevRevenue   * 100) : null
  const utilDelta  = prevUtilization > 0  ? utilization - prevUtilization                                     : null
  const rateDelta  = prevAvgRate > 1      ? Math.round((avgRate - prevAvgRate)         / prevAvgRate   * 100) : null

  const cards = [
    {
      label: `${t('revenueMTD')} · ${periodLabel}`,
      value: formatMoney(revenuePeriod),
      sub: revenueForecast ? `${t('forecastPrefix')}: ${formatMoney(revenueForecast)}` : t('billableOnly2'),
      icon: DollarSign, color: 'bg-emerald-500',
      delta: revDelta,
    },
    {
      label: t('pipelineRemaining'),
      value: formatMoney(pipeline),
      sub: t('acrossAllProjects'),
      icon: TrendingUp, color: 'bg-brand-600',
      delta: null,
    },
    {
      label: t('teamUtilization'),
      value: `${utilization}%`,
      sub: `${periodLabel} · ${t('billableTotalHours')}`,
      icon: Users, color: 'bg-violet-500',
      delta: utilDelta,
    },
    {
      label: t('avgEffectiveRate'),
      value: `${formatMoney(avgRate)}/h`,
      sub: `${periodLabel} · ${t('revenueDivBillable')}`,
      icon: Zap, color: 'bg-amber-500',
      delta: rateDelta,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, sub, icon: Icon, color, delta }) => (
        <div key={label} className="card p-5">
          <div className="flex items-start justify-between mb-3">
            <div className={`inline-flex p-2 rounded-lg ${color}`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <Delta value={delta} label={t('vsPrev')} />
          </div>
          <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
          <p className="text-xs text-muted-foreground/50 mt-0.5">{sub}</p>
        </div>
      ))}
    </div>
  )
}
