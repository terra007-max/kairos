'use client'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'

function Delta({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null || Math.abs(value) < 1) return <span className="text-[10px] text-muted-foreground/40">vs prev —</span>
  const up = value > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${up ? 'text-emerald-500' : 'text-red-400'}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '+' : ''}{value}{suffix} vs prev
    </span>
  )
}

function utilColor(pct: number) {
  if (pct > 110) return 'text-red-500'
  if (pct >= 80)  return 'text-emerald-500'
  if (pct >= 60)  return 'text-amber-500'
  return 'text-muted-foreground'
}
function utilBarColor(pct: number) {
  if (pct > 110) return 'bg-red-500'
  if (pct >= 80)  return 'bg-emerald-500'
  if (pct >= 60)  return 'bg-amber-500'
  return 'bg-muted-foreground/40'
}
function utilAccentLine(pct: number) {
  if (pct > 110) return 'from-red-500'
  if (pct >= 80)  return 'from-emerald-500'
  if (pct >= 60)  return 'from-amber-500'
  return 'from-muted-foreground/30'
}

export function KPIRow({
  revenuePeriod, pipeline, utilization, avgRate, revenueForecast,
  periodLabel, prevRevenue, prevUtilization, prevAvgRate,
  totalBillableHours, totalCapacity,
}: {
  revenuePeriod: number
  pipeline: number
  utilization: number
  avgRate: number
  revenueForecast: number | null
  periodLabel: string
  prevRevenue: number
  prevUtilization: number
  prevAvgRate: number
  totalBillableHours: number
  totalCapacity: number
}) {
  const { t } = useI18n()
  const revDelta  = prevRevenue > 10 ? Math.round((revenuePeriod - prevRevenue) / prevRevenue * 100) : null
  const utilDelta = prevUtilization > 0 ? utilization - prevUtilization : null
  const rateDelta = prevAvgRate > 1   ? Math.round((avgRate - prevAvgRate) / prevAvgRate * 100) : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

      {/* Revenue */}
      <div className="card p-5 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent" />
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('revenueMTD')}</p>
        <p className="text-3xl font-bold text-foreground mt-2 tracking-tight leading-none">{formatMoney(revenuePeriod)}</p>
        <div className="mt-3 flex items-center justify-between">
          <Delta value={revDelta} suffix="%" />
          {revenueForecast && (
            <span className="text-[10px] text-muted-foreground">
              <span className="text-emerald-500 font-semibold">{formatMoney(revenueForecast)}</span> forecast
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1">{periodLabel} · billable only</p>
      </div>

      {/* Utilization */}
      <div className="card p-5 relative overflow-hidden">
        <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${utilAccentLine(utilization)} via-transparent to-transparent`} />
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('teamUtilization')}</p>
        <p className={`text-3xl font-bold mt-2 tracking-tight leading-none ${utilColor(utilization)}`}>{utilization}%</p>
        <div className="mt-3 space-y-1.5">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${utilBarColor(utilization)}`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{totalBillableHours.toFixed(0)}h / {totalCapacity.toFixed(0)}h</span>
            <Delta value={utilDelta} suffix="pp" />
          </div>
        </div>
      </div>

      {/* Avg Rate */}
      <div className="card p-5 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-violet-400 to-transparent" />
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('avgEffectiveRate')}</p>
        <div className="mt-2 flex items-end gap-1 leading-none">
          <p className="text-3xl font-bold text-foreground tracking-tight">{formatMoney(avgRate)}</p>
          <p className="text-base text-muted-foreground pb-0.5">/h</p>
        </div>
        <div className="mt-3">
          <Delta value={rateDelta} suffix="%" />
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1">{periodLabel} · revenue ÷ billable hours</p>
      </div>

      {/* Pipeline */}
      <div className="card p-5 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-600 via-brand-500 to-transparent" />
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('pipelineRemaining')}</p>
        <p className="text-3xl font-bold text-foreground mt-2 tracking-tight leading-none">{formatMoney(pipeline)}</p>
        <p className="text-[10px] text-muted-foreground/50 mt-4">{t('acrossAllProjects')}</p>
      </div>

    </div>
  )
}
