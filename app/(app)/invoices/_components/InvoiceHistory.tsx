'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { formatMoney } from '@/lib/types'
import { format } from 'date-fns'
import { de as dateFnsDE, enUS as dateFnsEN } from 'date-fns/locale'
import { FileText, Download, Send, CheckCircle, Clock, Search, X, Pencil, Trash2, Check, Package, Code2 } from 'lucide-react'
import { type SavedInvoice, type InvoiceStatus } from '../_lib/types'
import { exportBMDNTCS, exportEBInterface, downloadPDF } from '../_lib/export'

function StatusBadge({ status, t }: { status: InvoiceStatus; t: (k: any) => string }) {
  if (status === 'paid') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <CheckCircle className="w-3 h-3" /> {t('invoiceStatusPaid')}
    </span>
  )
  if (status === 'sent') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-600/10 text-brand-600 dark:text-brand-500">
      <Send className="w-3 h-3" /> {t('invoiceStatusSent')}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <Clock className="w-3 h-3" /> {t('invoiceStatusDraft')}
    </span>
  )
}

export function InvoiceHistory({ invoices, onUpdate }: {
  invoices: SavedInvoice[]
  onUpdate: (updated: SavedInvoice[]) => void
}) {
  const { t, locale } = useI18n()
  const supabase = createClient()
  const dateFnsLocale = locale === 'de' ? dateFnsDE : dateFnsEN

  const [searchQuery, setSearchQuery] = useState('')
  const [editingInvoice, setEditingInvoice] = useState<SavedInvoice | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [taxCode, setTaxCode] = useState('U20')
  const [revenueAccount, setRevenueAccount] = useState('4000')
  const [debitorAccount, setDebitorAccount] = useState('10000')

  useEffect(() => {
    setTaxCode(localStorage.getItem('kairos-bmd-taxcode') || 'U20')
    setRevenueAccount(localStorage.getItem('kairos-bmd-revenue') || '4000')
    setDebitorAccount(localStorage.getItem('kairos-bmd-debitor') || '10000')
  }, [])

  async function updateStatus(id: string, status: InvoiceStatus) {
    const update: Partial<SavedInvoice> & { sent_at?: string; paid_at?: string } = { status }
    if (status === 'sent') update.sent_at = new Date().toISOString()
    if (status === 'paid') update.paid_at = new Date().toISOString()
    await supabase.from('invoices').update(update).eq('id', id)
    onUpdate(invoices.map(inv => inv.id === id ? { ...inv, ...update } : inv))
  }

  async function deleteInvoice(id: string) {
    await supabase.from('invoices').delete().eq('id', id)
    onUpdate(invoices.filter(inv => inv.id !== id))
    setDeleteConfirmId(null)
  }

  async function saveEdit() {
    if (!editingInvoice) return
    const update = {
      invoice_number: editingInvoice.invoice_number,
      due_date: editingInvoice.due_date,
      notes: editingInvoice.notes,
      order_reference: editingInvoice.order_reference,
    }
    await supabase.from('invoices').update(update).eq('id', editingInvoice.id)
    onUpdate(invoices.map(inv => inv.id === editingInvoice.id ? { ...inv, ...update } : inv))
    setEditingInvoice(null)
  }

  const filtered = invoices.filter(inv => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return inv.invoice_number.toLowerCase().includes(q) || inv.client_name.toLowerCase().includes(q) || inv.status.includes(q)
  })

  if (invoices.length === 0) return (
    <div className="card p-12 text-center">
      <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">{t('noSavedInvoices')}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
        <input className="input pl-9 pr-8 text-sm" placeholder={t('invoiceSearchPlaceholder')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filtered.map(inv => (
        <div key={inv.id} className="card p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-semibold text-foreground text-sm">{inv.invoice_number}</span>
                <StatusBadge status={inv.status} t={t} />
              </div>
              <p className="text-sm text-muted-foreground">{inv.client_name}</p>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-1">
                <span>{format(new Date(inv.issue_date), 'MMM d, yyyy', { locale: dateFnsLocale })}</span>
                <span className="hidden sm:inline">·</span>
                <span>{t('dueDateLabel')} {format(new Date(inv.due_date), 'MMM d, yyyy', { locale: dateFnsLocale })}</span>
                <span className="hidden sm:inline">·</span>
                <span>{format(new Date(inv.period_from), 'MMM d', { locale: dateFnsLocale })} – {format(new Date(inv.period_to), 'MMM d, yyyy', { locale: dateFnsLocale })}</span>
              </div>
              {inv.order_reference && <p className="text-xs text-muted-foreground/60 mt-0.5">Ref.: {inv.order_reference}</p>}
              {inv.notes && <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-2">{inv.notes}</p>}
              {inv.lines?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inv.lines.map((l, i) => (
                    <span key={i} className="text-[10px] bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-md">
                      {l.description} · {l.hours.toFixed(1)}h · {formatMoney(l.amount)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start shrink-0 gap-2">
              <div className="sm:text-right">
                <p className="font-bold text-foreground">{formatMoney(inv.total || inv.subtotal)}</p>
                {(inv.vat_amount || 0) > 0 && (
                  <p className="text-xs text-muted-foreground">{t('inclLabel')} {formatMoney(inv.vat_amount)} USt.</p>
                )}
              </div>
              <div className="flex gap-2 sm:mt-2 justify-end flex-wrap">
                {inv.status === 'sent' && (
                  <button onClick={() => updateStatus(inv.id, 'paid')} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10">
                    <CheckCircle className="w-3 h-3" /> {t('markAsPaid')}
                  </button>
                )}
                <button onClick={() => downloadPDF(inv)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1">
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button onClick={() => exportBMDNTCS(inv, taxCode, revenueAccount, debitorAccount)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1">
                  <Package className="w-3 h-3" /> BMD
                </button>
                <button onClick={() => exportEBInterface(inv)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1" title="ebInterface 6.1 XML">
                  <Code2 className="w-3 h-3" /> ebi
                </button>
                <button onClick={() => setEditingInvoice(inv)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1">
                  <Pencil className="w-3 h-3" />
                </button>
                {deleteConfirmId === inv.id ? (
                  <>
                    <button onClick={() => deleteInvoice(inv.id)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10">
                      <Check className="w-3 h-3" /> Confirm
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="btn-secondary text-xs py-1 px-2.5"><X className="w-3 h-3" /></button>
                  </>
                ) : (
                  <button onClick={() => setDeleteConfirmId(inv.id)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/10">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Edit modal */}
      {editingInvoice && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-semibold text-foreground mb-5 text-sm">Rechnung bearbeiten</h3>
            <div className="space-y-4">
              <div><label className="label">Rechnungsnummer</label><input className="input" value={editingInvoice.invoice_number} onChange={e => setEditingInvoice({ ...editingInvoice, invoice_number: e.target.value })} /></div>
              <div><label className="label">{t('dueDate')}</label><input type="date" className="input" value={editingInvoice.due_date} onChange={e => setEditingInvoice({ ...editingInvoice, due_date: e.target.value })} /></div>
              <div><label className="label">Bestellreferenz</label><input className="input" placeholder="Auftragsnummer …" value={editingInvoice.order_reference || ''} onChange={e => setEditingInvoice({ ...editingInvoice, order_reference: e.target.value })} /></div>
              <div><label className="label">{t('notesPayment')}</label><textarea className="input resize-none" rows={3} value={editingInvoice.notes || ''} onChange={e => setEditingInvoice({ ...editingInvoice, notes: e.target.value })} /></div>
              <div>
                <p className="label mb-2">Positionen (nur lesen)</p>
                <div className="rounded-lg border border-border divide-y divide-border text-xs">
                  {editingInvoice.lines.map((l, i) => (
                    <div key={i} className="flex justify-between px-3 py-2 text-muted-foreground">
                      <span>{l.description} · {l.hours.toFixed(2)}h</span>
                      <span className="font-medium text-foreground">{formatMoney(l.amount)}</span>
                    </div>
                  ))}
                  {(editingInvoice.vat_amount ?? 0) > 0 && (
                    <div className="flex justify-between px-3 py-2 text-muted-foreground">
                      <span>USt. {editingInvoice.vat_rate}%</span>
                      <span>{formatMoney(editingInvoice.vat_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-3 py-2 font-semibold text-foreground">
                    <span>Gesamt</span><span>{formatMoney(editingInvoice.total ?? editingInvoice.subtotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={saveEdit} className="btn-primary flex items-center gap-2 text-sm"><Check className="w-3.5 h-3.5" />{t('saveChanges')}</button>
              <button onClick={() => setEditingInvoice(null)} className="btn-secondary text-sm">{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
