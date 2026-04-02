'use client'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { healthColor, HealthIcon } from '../_lib/utils'

type ProjectHealth = {
  p: { id: string; name: string; color: string; budget_amount?: number | null; budget_hours?: number | null; client?: { name: string } | null }
  spent: number
  hoursSpent: number
  budgetPct: number | null
  hoursPct: number | null
  worstPct: number
}

export function ProjectHealthSection({ projectHealth }: { projectHealth: ProjectHealth[] }) {
  const { t } = useI18n()

  return (
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
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.client?.name || '—'}</p>
              </div>
              <div className="text-right shrink-0">
                {budgetPct !== null && <p className={`text-xs font-semibold ${healthColor(budgetPct)}`}>{formatMoney(spent)} / {formatMoney(p.budget_amount ?? 0)}</p>}
                {hoursPct !== null && <p className={`text-xs ${healthColor(hoursPct)}`}>{hoursSpent.toFixed(1)}h / {p.budget_hours}h</p>}
                {budgetPct === null && hoursPct === null && <p className="text-xs text-muted-foreground/50">{t('noBudgetSet')}</p>}
              </div>
              <HealthIcon pct={worstPct} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
