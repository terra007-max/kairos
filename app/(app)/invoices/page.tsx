'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { type Client, type Project, formatMoney } from '@/lib/types'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { FileText, Download, Send, CheckCircle, Clock, Package } from 'lucide-react'

type InvoiceLine = { description: string; hours: number; rate: number; amount: number }

type InvoiceStatus = 'draft' | 'sent' | 'paid'

type SavedInvoice = {
  id: string
  invoice_number: string
  client_name: string
  client_id: string
  issue_date: string
  due_date: string
  period_from: string
  period_to: string
  subtotal: number
  notes: string
  status: InvoiceStatus
  lines: InvoiceLine[]
  sent_at: string | null
  paid_at: string | null
  created_at: string
}

function statusBadge(status: InvoiceStatus, t: (k: any) => string) {
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

function exportBMDNTCS(invoice: SavedInvoice, taxCode: string, revenueAccount: string, debitorAccount: string) {
  const formatGermanDate = (d: string) => format(new Date(d), 'dd.MM.yyyy')
  const formatGermanAmount = (n: number) => n.toFixed(2).replace('.', ',')

  // BMD NTCS Buchungszeilen-Import format (semicolon separated)
  // Buchungskreis;Datum;Belegnummer;Buchungstext;Betrag;Steuercode;Debitorenkonto;Erlöskonto
  const header = 'Buchungskreis;Datum;Belegnummer;Buchungstext;Betrag;Steuercode;Debitorenkonto;Erlöskonto'
  const rows = invoice.lines.map(line =>
    [
      '1',
      formatGermanDate(invoice.issue_date),
      invoice.invoice_number,
      `"${invoice.client_name} - ${line.description}"`,
      formatGermanAmount(line.amount),
      taxCode || 'U20',
      debitorAccount || '10000',
      revenueAccount || '4000',
    ].join(';')
  )

  const content = [header, ...rows].join('\r\n')
  // BMD expects Windows-1252 encoding — use UTF-8 with BOM as modern NTCS supports it
  const bom = '\uFEFF'
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `BMD_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function InvoicesPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const router = useRouter()
  const { t } = useI18n()

  const [clients, setClients] = useState<Client[]>([])
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null } | null>(null)
  const [clientId, setClientId] = useState('')
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${format(new Date(), 'yyyyMM')}-001`)
  const [issueDate, setIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<InvoiceStatus>('draft')
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([])
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate')

  // BMD NTCS settings from localStorage
  const [taxCode, setTaxCode] = useState('')
  const [revenueAccount, setRevenueAccount] = useState('')
  const [debitorAccount, setDebitorAccount] = useState('')

  useEffect(() => {
    setTaxCode(localStorage.getItem('kairos-bmd-taxcode') || 'U20')
    setRevenueAccount(localStorage.getItem('kairos-bmd-revenue') || '4000')
    setDebitorAccount(localStorage.getItem('kairos-bmd-debitor') || '10000')
  }, [])

  // Redirect members
  useEffect(() => {
    if (role === 'member') router.push('/dashboard')
  }, [role, router])

  const load = useCallback(async () => {
    if (!workspaceId || role !== 'admin') return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: cl }, { data: prof }] = await Promise.all([
      supabase.from('clients').select('*').eq('workspace_id', workspaceId).order('name'),
      supabase.from('profiles').select('full_name, email').eq('id', user.id).single(),
    ])
    setClients(cl || [])
    setProfile(prof)

    // Load saved invoices
    const { data: inv } = await supabase
      .from('invoices')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    setSavedInvoices((inv as SavedInvoice[]) || [])
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

  async function generate() {
    if (!clientId) { alert(t('selectClient')); return }
    setLoading(true)
    const toEnd = new Date(toDate); toEnd.setHours(23, 59, 59)
    const { data: entries } = await supabase
      .from('time_entries')
      .select('*, project:projects!inner(*)')
      .eq('workspace_id', workspaceId)
      .eq('billable', true)
      .not('end_time', 'is', null)
      .gte('start_time', new Date(fromDate).toISOString())
      .lte('start_time', toEnd.toISOString())
      .eq('project.client_id', clientId)

    if (!entries || entries.length === 0) {
      alert(t('noBillableEntries'))
      setLoading(false); return
    }

    const projectGroups: Record<string, { project: Project; entries: any[] }> = {}
    for (const e of entries as any[]) {
      const pid = e.project_id
      if (!projectGroups[pid]) projectGroups[pid] = { project: e.project, entries: [] }
      projectGroups[pid].entries.push(e)
    }

    const newLines: InvoiceLine[] = Object.values(projectGroups).map(({ project, entries }) => {
      const totalSecs = entries.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0)
      const hours = totalSecs / 3600
      const rate = project.hourly_rate || 0
      return { description: project.name, hours: Math.round(hours * 100) / 100, rate, amount: Math.round(hours * rate * 100) / 100 }
    })

    setLines(newLines)
    setCurrentStatus('draft')
    setGenerated(true)
    setLoading(false)
  }

  async function saveInvoice() {
    if (!generated || !clientId) return
    setSaving(true)
    const selectedClient = clients.find(c => c.id === clientId)
    const payload = {
      workspace_id: workspaceId,
      invoice_number: invoiceNumber,
      client_id: clientId,
      client_name: selectedClient?.name || '',
      issue_date: issueDate,
      due_date: dueDate,
      period_from: fromDate,
      period_to: toDate,
      subtotal: lines.reduce((s, l) => s + l.amount, 0),
      notes,
      status: 'sent' as const,
      lines,
      sent_at: new Date().toISOString(),
      paid_at: null,
    }
    const { data } = await supabase.from('invoices').insert(payload).select().single()
    if (data) {
      setSavedInvoices(prev => [data as SavedInvoice, ...prev])
      setActiveTab('history')
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: InvoiceStatus) {
    const update: any = { status }
    if (status === 'sent') update.sent_at = new Date().toISOString()
    if (status === 'paid') update.paid_at = new Date().toISOString()
    await supabase.from('invoices').update(update).eq('id', id)
    setSavedInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...update } : inv))
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const selectedClient = clients.find(c => c.id === clientId)

  if (role === 'member') return null

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('invoicesTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('invoicesSubtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl mb-6 w-fit print:hidden">
        {(['generate', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab === 'generate' ? t('generateInvoice') : t('savedInvoices')}
            {tab === 'history' && savedInvoices.length > 0 && (
              <span className="ml-2 bg-brand-600/10 text-brand-600 text-xs px-1.5 py-0.5 rounded-full">{savedInvoices.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'generate' && (
        <>
          {/* Settings form */}
          <div className="card p-6 mb-6 print:hidden">
            <h2 className="font-semibold text-foreground text-sm mb-4">{t('invoiceSettings')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="label">{t('client')} *</label>
                <select className="input" value={clientId} onChange={e => { setClientId(e.target.value); setGenerated(false) }}>
                  <option value="">{t('selectClient')}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">{t('fromDate')}</label><input type="date" className="input" value={fromDate} onChange={e => { setFromDate(e.target.value); setGenerated(false) }} /></div>
              <div><label className="label">{t('toDate')}</label><input type="date" className="input" value={toDate} onChange={e => { setToDate(e.target.value); setGenerated(false) }} /></div>
              <div><label className="label">{t('invoiceNumber')}</label><input className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} /></div>
              <div><label className="label">{t('issueDate')}</label><input type="date" className="input" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
              <div><label className="label">{t('dueDate')}</label><input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              <div className="col-span-2 md:col-span-3">
                <label className="label">{t('notesPayment')}</label>
                <textarea className="input resize-none" rows={2} placeholder="e.g. IBAN AT12 3456 7890 · Payment within 30 days" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button onClick={generate} disabled={loading || !clientId} className="btn-primary flex items-center gap-2">
                <FileText className="w-4 h-4" /> {loading ? t('generating') : t('generateInvoice')}
              </button>
              {generated && (
                <>
                  <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2">
                    <Download className="w-4 h-4" /> {t('printPDF')}
                  </button>
                  <button
                    onClick={saveInvoice}
                    disabled={saving}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" /> {saving ? t('saving2') : t('saveInvoice')}
                  </button>
                  <button
                    onClick={() => exportBMDNTCS(
                      { id: '', invoice_number: invoiceNumber, client_name: selectedClient?.name || '', client_id: clientId, issue_date: issueDate, due_date: dueDate, period_from: fromDate, period_to: toDate, subtotal, notes, status: currentStatus, lines, sent_at: null, paid_at: null, created_at: new Date().toISOString() },
                      taxCode, revenueAccount, debitorAccount
                    )}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Package className="w-4 h-4" /> {t('exportBMD')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Invoice preview */}
          {generated && (
            <div className="card p-10 bg-white dark:bg-[hsl(217.2,32.6%,10%)]" id="invoice-preview">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{t('invoice')}</h2>
                  <p className="text-gray-400 text-sm">#{invoiceNumber}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900 dark:text-white text-lg">{profile?.full_name || profile?.email}</p>
                  <p className="text-gray-400 text-sm mt-1">{profile?.email}</p>
                  <div className="mt-2">{statusBadge(currentStatus, t)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-10">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('billTo')}</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">{selectedClient?.name}</p>
                  {selectedClient?.email && <p className="text-gray-400 text-sm mt-1">{selectedClient.email}</p>}
                </div>
                <div className="text-right space-y-1">
                  <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">{t('issueDate')}</span><span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{format(new Date(issueDate), 'MMM d, yyyy')}</span></div>
                  <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">{t('dueDate')}</span><span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{format(new Date(dueDate), 'MMM d, yyyy')}</span></div>
                  <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">{t('period')}</span><span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{format(new Date(fromDate), 'MMM d')} – {format(new Date(toDate), 'MMM d, yyyy')}</span></div>
                </div>
              </div>

              <table className="w-full mb-8">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Description</th>
                    <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Hours</th>
                    <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Rate</th>
                    <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-4 text-gray-900 dark:text-white font-medium">{line.description}</td>
                      <td className="py-4 text-right text-gray-600 dark:text-gray-400">{line.hours.toFixed(2)}h</td>
                      <td className="py-4 text-right text-gray-600 dark:text-gray-400">{formatMoney(line.rate)}/h</td>
                      <td className="py-4 text-right font-semibold text-gray-900 dark:text-white">{formatMoney(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end mb-8">
                <div className="w-64">
                  <div className="flex justify-between py-2"><span className="text-gray-500">{t('subtotal')}</span><span className="font-medium text-gray-900 dark:text-white">{formatMoney(subtotal)}</span></div>
                  <div className="flex justify-between py-3 border-t-2 border-gray-900 dark:border-gray-400 mt-1"><span className="font-bold text-gray-900 dark:text-white text-lg">Total</span><span className="font-bold text-gray-900 dark:text-white text-lg">{formatMoney(subtotal)}</span></div>
                </div>
              </div>

              {notes && (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{notes}</p>
                </div>
              )}
              <div className="mt-10 text-center"><p className="text-xs text-gray-300">{t('generatedBy')}</p></div>
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {savedInvoices.length === 0 ? (
            <div className="card p-12 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{t('noSavedInvoices')}</p>
            </div>
          ) : savedInvoices.map(inv => (
            <div key={inv.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-foreground text-sm">{inv.invoice_number}</span>
                    {statusBadge(inv.status, t)}
                  </div>
                  <p className="text-sm text-muted-foreground">{inv.client_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(inv.issue_date), 'MMM d, yyyy')} · {t('period')}: {format(new Date(inv.period_from), 'MMM d')} – {format(new Date(inv.period_to), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-foreground">{formatMoney(inv.subtotal)}</p>
                  <div className="flex gap-2 mt-2 justify-end flex-wrap">
                    {inv.status === 'draft' && (
                      <button onClick={() => updateStatus(inv.id, 'sent')} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1">
                        <Send className="w-3 h-3" /> {t('markAsSent')}
                      </button>
                    )}
                    {inv.status === 'sent' && (
                      <button onClick={() => updateStatus(inv.id, 'paid')} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10">
                        <CheckCircle className="w-3 h-3" /> {t('markAsPaid')}
                      </button>
                    )}
                    <button
                      onClick={() => exportBMDNTCS(inv, taxCode, revenueAccount, debitorAccount)}
                      className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                    >
                      <Package className="w-3 h-3" /> BMD
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@media print { nav, aside, .print\\:hidden { display: none !important; } #invoice-preview { box-shadow: none; border: none; } }`}</style>
    </div>
  )
}
