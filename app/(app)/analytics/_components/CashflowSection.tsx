'use client'
import { Receipt, AlertTriangle } from 'lucide-react'
import { formatMoney } from '@/lib/types'
import { useI18n } from '@/lib/i18n'

type Invoice = { status: string; subtotal: number; due_date: string; sent_at: string | null; paid_at: string | null; created_at: string }

export function CashflowSection({ cashflow, invoices, today, inPeriod, periodLabel }: {
  cashflow: { billed: number; paid: number; open: number; overdue: number }
  invoices: Invoice[]
  today: Date
  inPeriod: (dateStr: string | null) => boolean
  periodLabel: string
}) {
  const { t } = useI18n()

  const cards = [
    { label: t('totalBilled'), value: formatMoney(cashflow.billed), color: 'bg-brand-600', sub: `${invoices.filter(i => (i.status === 'paid' || i.status === 'sent') && inPeriod(i.sent_at || i.created_at)).length} ${t('invoicesLabel')}` },
    { label: t('collectedLabel'), value: formatMoney(cashflow.paid), color: 'bg-emerald-500', sub: `${invoices.filter(i => i.status === 'paid' && inPeriod(i.paid_at)).length} ${t('paidLabel')}` },
    { label: t('outstandingLabel'), value: formatMoney(cashflow.open), color: 'bg-amber-500', sub: `${invoices.filter(i => i.status === 'sent' && new Date(i.due_date) >= today).length} ${t('invoicesLabel')}` },
    { label: t('overdueLabel'), value: formatMoney(cashflow.overdue), color: cashflow.overdue > 0 ? 'bg-red-500' : 'bg-muted-foreground/30', sub: `${invoices.filter(i => i.status === 'sent' && new Date(i.due_date) < today).length} ${t('pastDueLabel')}` },
  ]

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cashflow</h2>
        <span className="text-xs text-muted-foreground/50">· {t('cashflowHint')}: {periodLabel} · {t('cashflowHintOutstanding')}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, color, sub }) => (
          <div key={label} className="flex items-center gap-3">
            <div className={`w-1 self-stretch rounded-full ${color}`} />
            <div>
              <p className="text-lg font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground/50">{sub}</p>
            </div>
          </div>
        ))}
      </div>
      {cashflow.overdue > 0 && (
        <div className="mt-4 flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-500">
            <span className="font-semibold">{formatMoney(cashflow.overdue)} {t('overdueAlertSuffix')}</span> — {invoices.filter(i => i.status === 'sent' && new Date(i.due_date) < today).length} {t('overdueAlertBody')}
          </p>
        </div>
      )}
    </div>
  )
}
