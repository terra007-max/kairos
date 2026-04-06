'use client'
import { ChevronLeft, ChevronRight, GitCompare, X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { utilBarColor, TrendPill } from '../_lib/utils'

type TeamUtilRow = {
  userId: string | null
  name: string
  email: string
  billable: number
  nonBillable: number
  revenue: number
  capacity: number
  pct: number
  trend: number
  avgHourlyRate: number
}

type DrillWeekData = { week: string; billable: number; capacity: number; pct: number }
type DrillProjectData = { name: string; billable: number; revenue: number; color: string }
type MemberLike = { user_id: string | null; full_name?: string | null; weekly_hours?: number | null; email?: string | null }

function utilTextColor(pct: number) {
  if (pct > 110) return 'text-red-500'
  if (pct >= 80)  return 'text-emerald-500'
  if (pct >= 60)  return 'text-amber-500'
  return 'text-muted-foreground'
}

function initials(name: string) {
  const parts = name.split(/[@.\s]/).filter(Boolean)
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

const COMPARE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export function TeamUtilizationSection({
  teamUtilUnified, drillMember, drillWeekData, drillProjectBreakdown,
  utilMemberId, setUtilMemberId, activeMembers, periodLabel,
  compareMode, selectedForCompare, onToggleCompareMode, onToggleSelectForCompare,
}: {
  teamUtilUnified: TeamUtilRow[]
  drillMember: MemberLike | undefined
  drillWeekData: DrillWeekData[]
  drillProjectBreakdown: DrillProjectData[]
  utilMemberId: string
  setUtilMemberId: (id: string) => void
  activeMembers: MemberLike[]
  periodLabel: string
  compareMode: boolean
  selectedForCompare: Set<string>
  onToggleCompareMode: () => void
  onToggleSelectForCompare: (userId: string) => void
}) {
  const { t } = useI18n()

  const compareRows = teamUtilUnified.filter(r => selectedForCompare.has(r.userId ?? ''))
  const compareChartData = compareRows.map((r, i) => ({
    name: r.name.split('@')[0].split('.')[0],
    fullName: r.name,
    billable: r.billable,
    capacity: r.capacity,
    nonBillable: r.nonBillable,
    pct: r.pct,
    color: COMPARE_COLORS[i % COMPARE_COLORS.length],
  }))
  const chartMax = compareChartData.length > 0 ? Math.max(...compareChartData.map(d => Math.max(d.billable, d.capacity))) : 40

  // Custom bar: dashed outline = capacity, solid fill = billable
  function CapacityFillBar(props: any) {
    const { x, y, width, height, payload, background } = props
    if (!background || !payload) return null
    const chartBottom = background.y + background.height
    const capacityH = chartMax > 0 ? (payload.capacity / chartMax) * background.height : 0
    const billableH = Math.max(0, Math.min(height, background.height))
    const r = 4
    return (
      <g>
        {/* Capacity — dashed outline */}
        <rect
          x={x + 1} y={chartBottom - capacityH} width={width - 2} height={capacityH}
          fill="none"
          stroke={payload.color}
          strokeOpacity={0.4}
          strokeDasharray="5 3"
          strokeWidth={2}
          rx={r}
        />
        {/* Billable — solid fill */}
        {billableH > 0 && (
          <rect
            x={x + 1} y={chartBottom - billableH} width={width - 2} height={billableH}
            fill={payload.color}
            fillOpacity={0.85}
            rx={r}
          />
        )}
      </g>
    )
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        {drillMember ? (
          <button
            onClick={() => setUtilMemberId('all')}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> {t('allMembers')}
          </button>
        ) : (
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('teamUtilHeader')} <span className="font-normal normal-case opacity-60">· {periodLabel}</span>
          </h2>
        )}
        <div className="flex-1" />

        {!drillMember && (
          <button
            onClick={onToggleCompareMode}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              compareMode
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            {compareMode ? `${selectedForCompare.size} ${t('compareSelected')}` : t('compareBtn')}
          </button>
        )}

        {!compareMode && !drillMember && (
          <select
            className="input w-auto text-xs py-1"
            value={utilMemberId}
            onChange={e => setUtilMemberId(e.target.value)}
          >
            <option value="all">{t('allMembers')}</option>
            {activeMembers.map(m => (
              <option key={m.user_id!} value={m.user_id!}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Compare mode ─────────────────────────────────────────────────────── */}
      {compareMode && !drillMember && (
        <div>
          {/* Member list with checkboxes */}
          <div className="divide-y divide-border/50">
            {teamUtilUnified.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 text-center py-8">No data for this period</p>
            ) : teamUtilUnified.map((row, i) => {
              const isSelected = selectedForCompare.has(row.userId ?? '')
              const colorIdx = compareRows.findIndex(r => r.userId === row.userId)
              const color = colorIdx >= 0 ? COMPARE_COLORS[colorIdx % COMPARE_COLORS.length] : undefined

              return (
                <button
                  key={row.userId}
                  onClick={() => row.userId && onToggleSelectForCompare(row.userId)}
                  disabled={!isSelected && selectedForCompare.size >= 5}
                  className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                    isSelected ? 'bg-muted/60' : 'hover:bg-muted/30'
                  } ${!isSelected && selectedForCompare.size >= 5 ? 'opacity-40' : ''}`}
                >
                  {/* Color swatch / checkbox */}
                  <div
                    className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-all ${
                      isSelected ? 'border-transparent' : 'border-border'
                    }`}
                    style={isSelected && color ? { backgroundColor: color } : {}}
                  >
                    {isSelected && <span className="text-white text-[9px] font-bold">{colorIdx + 1}</span>}
                  </div>

                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-muted text-foreground">
                    {initials(row.name)}
                  </div>

                  {/* Name */}
                  <div className="w-36 shrink-0">
                    <p className="text-sm font-medium text-foreground truncate">{row.name.split('@')[0]}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{row.email}</p>
                  </div>

                  {/* Bar */}
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(row.pct, 100)}%`,
                        backgroundColor: color ?? (row.pct >= 80 ? '#10b981' : row.pct >= 60 ? '#f59e0b' : '#94a3b8'),
                      }}
                    />
                  </div>

                  <span className={`text-sm font-bold w-10 text-right tabular-nums ${utilTextColor(row.pct)}`}>{row.pct}%</span>
                  <span className="text-xs text-muted-foreground w-20 text-right tabular-nums hidden sm:block">{row.billable}h / {row.capacity}h</span>
                  <span className="text-xs text-emerald-600 w-20 text-right tabular-nums hidden md:block">{formatMoney(row.revenue)}</span>
                  <TrendPill delta={row.trend} />
                </button>
              )
            })}
          </div>

          {/* Comparison panel */}
          {compareRows.length >= 2 && (
            <div className="border-t border-border bg-muted/20 p-5 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('comparisonTitle')} · {periodLabel}</p>
                <button onClick={onToggleCompareMode} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {compareRows.map((row, i) => (
                  <div key={row.userId} className="bg-card rounded-xl p-4 border border-border relative overflow-hidden">
                    <div
                      className="absolute inset-x-0 top-0 h-0.5"
                      style={{ background: `linear-gradient(to right, ${COMPARE_COLORS[i % COMPARE_COLORS.length]}, transparent)` }}
                    />
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white mb-2"
                      style={{ backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length] }}
                    >
                      {i + 1}
                    </div>
                    <p className="text-xs font-semibold text-foreground truncate">{row.name.split('@')[0]}</p>
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Utilization</p>
                        <p className={`text-xl font-bold ${utilTextColor(row.pct)}`}>{row.pct}%</p>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                        <span className="text-muted-foreground">{t('billableHours2')}</span>
                        <span className="text-right font-medium text-foreground">{row.billable}h</span>
                        <span className="text-muted-foreground">{t('capacityLabel')}</span>
                        <span className="text-right font-medium text-foreground">{row.capacity}h</span>
                        <span className="text-muted-foreground">{t('earnings')}</span>
                        <span className="text-right font-medium text-emerald-600">{formatMoney(row.revenue)}</span>
                        <span className="text-muted-foreground">{t('avgEffectiveRate')}</span>
                        <span className="text-right font-medium text-foreground">{formatMoney(row.avgHourlyRate)}/h</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Comparison bar chart */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('billableVsCapacity')}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={compareChartData} barGap={4} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} domain={[0, chartMax]} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]?.payload
                        return (
                          <div className="bg-card border border-border rounded-xl p-3 text-xs shadow-xl">
                            <p className="font-semibold text-foreground mb-2">{d?.fullName || label}</p>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">{t('billableHours2')}</span>
                                <span className="font-medium text-emerald-500">{d?.billable}h</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">{t('capacityLabel')}</span>
                                <span className="font-medium text-foreground">{d?.capacity}h</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">{t('nonBillable2')}</span>
                                <span className="font-medium text-muted-foreground">{d?.nonBillable}h</span>
                              </div>
                              <div className="h-px bg-border my-1" />
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">{t('utilizationLabel')}</span>
                                <span className={`font-bold ${utilTextColor(d?.pct ?? 0)}`}>{d?.pct}%</span>
                              </div>
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Bar
                      dataKey="billable"
                      name={t('billableHours2')}
                      shape={<CapacityFillBar />}
                      background={{ fill: 'none' }}
                      isAnimationActive={false}
                      barSize={52}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Utilization ranking */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('utilizationRanking')}</p>
                <div className="space-y-2">
                  {[...compareRows].sort((a, b) => b.pct - a.pct).map((row, i) => {
                    const originalIdx = compareRows.findIndex(r => r.userId === row.userId)
                    return (
                      <div key={row.userId} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: COMPARE_COLORS[originalIdx % COMPARE_COLORS.length] }}
                        />
                        <span className="text-xs text-foreground w-32 truncate">{row.name.split('@')[0]}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(row.pct, 100)}%`,
                              backgroundColor: COMPARE_COLORS[originalIdx % COMPARE_COLORS.length],
                            }}
                          />
                        </div>
                        <span className={`text-xs font-bold w-10 text-right tabular-nums ${utilTextColor(row.pct)}`}>{row.pct}%</span>
                        <span className="text-xs text-muted-foreground w-20 text-right hidden sm:block">{formatMoney(row.revenue)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {compareRows.length === 1 && (
            <div className="px-5 py-3 border-t border-border bg-muted/10">
              <p className="text-xs text-muted-foreground">{t('selectAtLeastTwo')}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Normal list mode ─────────────────────────────────────────────────── */}
      {!compareMode && !drillMember && (
        <div className="divide-y divide-border/50">
          {teamUtilUnified.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 text-center py-10">No data for this period</p>
          ) : teamUtilUnified.map(row => (
            <button
              key={row.userId}
              onClick={() => row.userId && setUtilMemberId(row.userId)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors group text-left"
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                {initials(row.name)}
              </div>

              {/* Name */}
              <div className="w-36 shrink-0">
                <p className="text-sm font-medium text-foreground truncate">{row.name.split('@')[0]}</p>
                <p className="text-[10px] text-muted-foreground truncate">{row.email}</p>
              </div>

              {/* Progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">{row.billable}h / {row.capacity}h</span>
                  <span className="text-[10px] text-emerald-600 hidden sm:block">{formatMoney(row.revenue)}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${utilBarColor(row.pct)}`}
                    style={{ width: `${Math.min(row.pct, 100)}%` }}
                  />
                </div>
              </div>

              <span className={`text-sm font-bold w-10 text-right tabular-nums shrink-0 ${utilTextColor(row.pct)}`}>{row.pct}%</span>
              <TrendPill delta={row.trend} />
              <ChevronRight className="w-4 h-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
          <div className="px-5 py-2">
            <p className="text-[10px] text-muted-foreground/40 text-right">{t('drillDownHint')} · {t('compareClickHint')}</p>
          </div>
        </div>
      )}

      {/* ── Drill-down (single member) ────────────────────────────────────────── */}
      {!compareMode && drillMember && (() => {
        const row = teamUtilUnified.find(r => r.userId === drillMember.user_id)
        if (!row) return null
        return (
          <div className="p-5 space-y-6">
            {/* Member header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                {initials(row.name)}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{row.name.split('@')[0]}</p>
                <p className="text-xs text-muted-foreground">{row.email} · {periodLabel}</p>
              </div>
            </div>

            {/* KPI mini cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t('utilizationLabel'), value: `${row.pct}%`, sub: periodLabel, valueClass: utilTextColor(row.pct) },
                { label: t('billableHours2'), value: `${row.billable}h`, sub: `${row.capacity}h ${t('capacityLabel')}` },
                { label: t('earnings'), value: formatMoney(row.revenue), sub: t('billableOnly2'), valueClass: 'text-emerald-600' },
                { label: t('nonBillable2'), value: `${row.nonBillable}h`, sub: t('internalOverhead') },
              ].map(({ label, value, sub, valueClass }) => (
                <div key={label} className="bg-muted/40 rounded-xl p-3.5">
                  <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
                  <p className={`text-xl font-bold mt-1 ${valueClass || 'text-foreground'}`}>{value}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* Week-by-week chart */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('weekByWeekLabel')}</p>
              {drillWeekData.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 text-center py-8">No data for this period</p>
              ) : (() => {
                const wkChartMax = Math.max(...drillWeekData.map(d => Math.max(d.billable, d.capacity)), 1)
                function DrillWeekBar(props: any) {
                  const { x, y, width, height, payload, background } = props
                  if (!background || !payload) return null
                  const chartBottom = background.y + background.height
                  const capH = wkChartMax > 0 ? (payload.capacity / wkChartMax) * background.height : 0
                  const billH = Math.max(0, Math.min(height, background.height))
                  const r = 3
                  return (
                    <g>
                      <rect x={x + 1} y={chartBottom - capH} width={width - 2} height={capH}
                        fill="none" stroke="#10b981" strokeOpacity={0.3} strokeDasharray="5 3" strokeWidth={2} rx={r} />
                      {billH > 0 && (
                        <rect x={x + 1} y={chartBottom - billH} width={width - 2} height={billH}
                          fill="#10b981" fillOpacity={0.85} rx={r} />
                      )}
                    </g>
                  )
                }
                return (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={drillWeekData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} domain={[0, wkChartMax]} />
                      <Tooltip
                        content={({ active, payload, label: l }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload
                          return (
                            <div className="bg-card border border-border rounded-xl p-2.5 text-xs shadow-lg">
                              <p className="font-semibold text-foreground mb-1">{l}</p>
                              <p className="text-emerald-500">Billable: {d.billable}h</p>
                              <p className="text-muted-foreground">Capacity: {d.capacity}h</p>
                              <p className={`font-bold ${utilTextColor(d.pct)}`}>{d.pct}% utilization</p>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="billable" shape={<DrillWeekBar />} background={{ fill: 'none' }} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()}
            </div>

            {/* Project breakdown */}
            {drillProjectBreakdown.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('timeByProject')}</p>
                <div className="space-y-2.5">
                  {drillProjectBreakdown.map((p, i) => {
                    const maxH = drillProjectBreakdown[0].billable
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-xs text-foreground truncate w-40 shrink-0">{p.name}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${maxH > 0 ? (p.billable / maxH) * 100 : 0}%`, backgroundColor: p.color }} />
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
