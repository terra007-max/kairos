'use client'
import { DollarSign, TrendingUp, Users, Zap } from 'lucide-react'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'

export function KPIRow({ revenuePeriod, pipeline, utilization, avgRate, revenueForecast, periodLabel }: {
  revenuePeriod: number
  pipeline: number
  utilization: number
  avgRate: number
  revenueForecast: number | null
  periodLabel: string
}) {
  const { t } = useI18n()

  const cards = [
    { label: `${t('revenueMTD')} · ${periodLabel}`, value: formatMoney(revenuePeriod), sub: revenueForecast ? `${t('forecastPrefix')}: ${formatMoney(revenueForecast)}` : t('billableOnly2'), icon: DollarSign, color: 'bg-emerald-500' },
    { label: t('pipelineRemaining'), value: formatMoney(pipeline), sub: t('acrossAllProjects'), icon: TrendingUp, color: 'bg-brand-600' },
    { label: t('teamUtilization'), value: `${utilization}%`, sub: `${periodLabel} · ${t('billableTotalHours')}`, icon: Users, color: 'bg-violet-500' },
    { label: t('avgEffectiveRate'), value: `${formatMoney(avgRate)}/h`, sub: `${periodLabel} · ${t('revenueDivBillable')}`, icon: Zap, color: 'bg-amber-500' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, sub, icon: Icon, color }) => (
        <div key={label} className="card p-5">
          <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}><Icon className="w-4 h-4 text-white" /></div>
          <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
          <p className="text-xs text-muted-foreground/50 mt-0.5">{sub}</p>
        </div>
      ))}
    </div>
  )
}
