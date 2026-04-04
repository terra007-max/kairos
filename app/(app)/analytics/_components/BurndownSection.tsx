'use client'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import { formatMoney, formatDuration } from '@/lib/types'
import { differenceInDays, parseISO } from 'date-fns'
import { useI18n } from '@/lib/i18n'
import { healthColor, healthBg } from '../_lib/utils'

type BurndownPoint = { date: string; spent: number; budget: number | null; forecast?: number }
type ProjectLike = { id: string; name: string; budget_amount?: number | null; budget_hours?: number | null }
type EntryWithEarnings = { project_id: string; billable: boolean; earnings: number; duration_sec?: number; start_time: string }

export function BurndownSection({ scopedProjects, selectedProject, setSelectedProject, burndownData, burndownProject, burndownEntries, entries }: {
  scopedProjects: ProjectLike[]
  selectedProject: string
  setSelectedProject: (id: string) => void
  burndownData: BurndownPoint[]
  burndownProject: ProjectLike | null | undefined
  burndownEntries: EntryWithEarnings[]
  entries: EntryWithEarnings[]
}) {
  const { t } = useI18n()

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('budgetBurndown')}</h2>
        <select className="input w-auto text-xs py-1" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="all">{t('selectProject')}</option>
          {scopedProjects.filter(p => p.budget_amount).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject === 'all' ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-sm">{t('selectProjectHint')}</div>
      ) : burndownData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground/50 text-sm">{t('noBillableEntriesProject')}</div>
      ) : (
        <>
          {burndownProject && (() => {
            const spent = burndownEntries.reduce((s, e) => s + e.earnings, 0)
            const budget = burndownProject.budget_amount || 0
            const remaining = Math.max(0, budget - spent)
            const pct = budget > 0 ? Math.round(spent / budget * 100) : 0
            const hoursSpent = entries.filter(e => e.project_id === burndownProject.id).reduce((s, e) => s + (e.duration_sec || 0) / 3600, 0)
            const firstEntryDate = burndownEntries[0]?.start_time?.split('T')[0]
            const burnPerDay = burndownData.length > 1 && firstEntryDate ? spent / Math.max(1, differenceInDays(new Date(), parseISO(firstEntryDate))) : 0
            const daysToComplete = burnPerDay > 0 && remaining > 0 ? Math.ceil(remaining / burnPerDay) : null
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className={`rounded-lg p-3 border ${healthBg(pct)}`}>
                  <p className="text-xs text-muted-foreground">{t('budgetUsed')}</p>
                  <p className={`text-lg font-bold ${healthColor(pct)}`}>{pct}%</p>
                  <p className="text-xs text-muted-foreground">{formatMoney(spent)} {t('ofBudget')} {formatMoney(budget)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{t('remaining')}</p>
                  <p className="text-lg font-bold text-foreground">{formatMoney(remaining)}</p>
                  <p className="text-xs text-muted-foreground">{formatDuration(Math.round((remaining / (spent / Math.max(hoursSpent, 0.1))) * 3600))} {t('estAbbr')}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{t('hoursLogged')}</p>
                  <p className="text-lg font-bold text-foreground">{hoursSpent.toFixed(1)}h</p>
                  {burndownProject.budget_hours && <p className="text-xs text-muted-foreground">{t('ofBudget')} {burndownProject.budget_hours}h</p>}
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{t('estCompletion')}</p>
                  <p className="text-lg font-bold text-foreground">{daysToComplete ? `${daysToComplete}d` : '—'}</p>
                  <p className="text-xs text-muted-foreground">{burnPerDay > 0 ? `${formatMoney(burnPerDay)}${t('dayBurn')}` : t('noData')}</p>
                </div>
              </div>
            )
          })()}

          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={burndownData}>
              <defs>
                <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [formatMoney(Number(v ?? 0)), '']} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, backgroundColor: 'var(--card)', color: 'var(--card-foreground)' }} />
              {burndownProject?.budget_amount && <ReferenceLine y={burndownProject.budget_amount} stroke="#ef4444" strokeDasharray="6 3" label={{ value: t('budgetLabel'), fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />}
              <Area type="monotone" dataKey="spent" name={t('spentLabel')} stroke="#6366f1" strokeWidth={2} fill="url(#spentGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
