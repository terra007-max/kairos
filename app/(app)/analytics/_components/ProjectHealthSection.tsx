'use client'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

type ProjectHealth = {
  p: { id: string; name: string; color: string; budget_amount?: number | null; budget_hours?: number | null; client?: { name: string } | null }
  spent: number
  hoursSpent: number
  budgetPct: number | null
  hoursPct: number | null
  worstPct: number
}

function healthTextColor(pct: number) {
  if (pct >= 100) return 'text-red-500'
  if (pct >= 80)  return 'text-amber-500'
  return 'text-emerald-500'
}
function healthBarColor(pct: number) {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80)  return 'bg-amber-500'
  return 'bg-emerald-500'
}
function HealthIcon({ pct }: { pct: number }) {
  if (pct >= 100) return <XCircle className="w-4 h-4 text-red-500 shrink-0" />
  if (pct >= 80)  return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
  return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
}

export function ProjectHealthSection({ projectHealth }: { projectHealth: ProjectHealth[] }) {
  const { t } = useI18n()

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('projectHealth')}</h2>
        <span className="text-[10px] text-muted-foreground/50">All-time · budget consumption</span>
      </div>

      {projectHealth.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground/50 text-xs">
          {t('noProjectsWithBudgets')}
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {projectHealth.map(({ p, spent, hoursSpent, budgetPct, hoursPct, worstPct }) => (
            <div key={p.id} className="px-5 py-4 flex items-start gap-4">
              {/* Project color dot */}
              <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: p.color }} />

              {/* Name + client */}
              <div className="w-48 shrink-0 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">{p.client?.name || '—'}</p>
              </div>

              {/* Budget bars */}
              <div className="flex-1 min-w-0 space-y-2">
                {budgetPct !== null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">Budget</span>
                      <span className={`text-[10px] font-semibold tabular-nums ${healthTextColor(budgetPct)}`}>
                        {formatMoney(spent)} / {formatMoney(p.budget_amount ?? 0)} · {budgetPct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${healthBarColor(budgetPct)}`}
                        style={{ width: `${Math.min(budgetPct, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {hoursPct !== null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">Hours</span>
                      <span className={`text-[10px] font-semibold tabular-nums ${healthTextColor(hoursPct)}`}>
                        {hoursSpent.toFixed(1)}h / {p.budget_hours}h · {hoursPct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${healthBarColor(hoursPct)}`}
                        style={{ width: `${Math.min(hoursPct, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {budgetPct === null && hoursPct === null && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full" />
                    <span className="text-[10px] text-muted-foreground/50">{t('noBudgetSet')}</span>
                  </div>
                )}
              </div>

              {/* Health icon */}
              <div className="shrink-0 mt-0.5">
                <HealthIcon pct={worstPct} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
