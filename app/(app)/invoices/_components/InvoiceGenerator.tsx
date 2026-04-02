'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { type Client, type Project, formatMoney } from '@/lib/types'
import { format, startOfMonth, endOfMonth, startOfWeek } from 'date-fns'
import { FileText, Download, Send, Package, FolderOpen, AlertTriangle, ShieldCheck } from 'lucide-react'
import { type InvoiceLine, type HoursSummary, type WorkspaceLegal, type SavedInvoice, VAT_OPTIONS } from '../_lib/types'
import { sellerBlock, buyerBlock, exportBMDNTCS } from '../_lib/export'

type Profile = { id: string; full_name: string | null; email: string | null }

export function InvoiceGenerator({
  clients,
  workspace,
  profile,
  onSaved,
}: {
  clients: Client[]
  workspace: WorkspaceLegal | null
  profile: Profile | null
  onSaved: (inv: SavedInvoice) => void
}) {
  const { t } = useI18n()
  const supabase = createClient()
  const { workspaceId } = useWorkspace()

  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('all')
  const [clientProjects, setClientProjects] = useState<Project[]>([])
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${format(new Date(), 'yyyyMM')}-001`)
  const [issueDate, setIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [vatRateIdx, setVatRateIdx] = useState(0)
  const [orderReference, setOrderReference] = useState('')
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [hoursSummary, setHoursSummary] = useState<HoursSummary[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [taxCode, setTaxCode] = useState('U20')
  const [revenueAccount, setRevenueAccount] = useState('4000')
  const [debitorAccount, setDebitorAccount] = useState('10000')

  const cachedEntriesRef = useRef<any[]>([])
  const cachedApprovedSet = useRef<Set<string>>(new Set())

  useEffect(() => {
    setTaxCode(localStorage.getItem('kairos-bmd-taxcode') || 'U20')
    setRevenueAccount(localStorage.getItem('kairos-bmd-revenue') || '4000')
    setDebitorAccount(localStorage.getItem('kairos-bmd-debitor') || '10000')
  }, [])

  useEffect(() => {
    setProjectId('all')
    setClientProjects([])
    setHoursSummary([])
    setGenerated(false)
    if (!clientId || !workspaceId) return
    supabase.from('projects').select('*').eq('workspace_id', workspaceId).eq('client_id', clientId).eq('status', 'active').is('deleted_at', null).order('name')
      .then(({ data }) => setClientProjects(data || []))
  }, [clientId, workspaceId])

  const loadHoursSummary = useCallback(async () => {
    if (!clientId || !workspaceId) { setHoursSummary([]); return }
    setSummaryLoading(true)
    setGenerated(false)
    const toEnd = new Date(toDate); toEnd.setHours(23, 59, 59)

    let query = supabase
      .from('time_entries')
      .select('*, project:projects!inner(*, client:clients(*), level_rates:project_level_rates(level_id, hourly_rate))')
      .eq('workspace_id', workspaceId).eq('billable', true).not('end_time', 'is', null)
      .gte('start_time', new Date(fromDate).toISOString()).lte('start_time', toEnd.toISOString())
      .eq('project.client_id', clientId)
    if (projectId !== 'all') query = query.eq('project_id', projectId)

    const { data: entries } = await query
    const { data: timesheets } = await supabase
      .from('timesheets').select('user_id, week_start, status')
      .eq('workspace_id', workspaceId).in('status', ['approved', 'submitted', 'draft', 'rejected'])

    const tsStatusMap: Record<string, string> = {}
    for (const ts of timesheets || []) tsStatusMap[`${ts.user_id}:${ts.week_start}`] = ts.status

    const projectMap: Record<string, HoursSummary> = {}
    for (const e of entries || []) {
      const pid = e.project_id
      if (!projectMap[pid]) {
        projectMap[pid] = { projectId: pid, projectName: e.project?.name || 'Unknown', color: e.project?.color || '#6366f1', approvedHours: 0, pendingHours: 0, draftHours: 0, approvedRevenue: 0, rate: e.project?.hourly_rate || 0 }
      }
      const weekStart = format(startOfWeek(new Date(e.start_time), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const tsStatus = tsStatusMap[`${e.user_id}:${weekStart}`] || 'draft'
      const hours = (e.duration_sec || 0) / 3600
      if (tsStatus === 'approved') {
        projectMap[pid].approvedHours += hours
        const levelRate = e.level_id ? (e.project?.level_rates?.find((r: any) => r.level_id === e.level_id)?.hourly_rate || 0) : 0
        projectMap[pid].approvedRevenue += hours * (e.hourly_rate || levelRate || e.project?.hourly_rate || 0)
      } else if (tsStatus === 'submitted') {
        projectMap[pid].pendingHours += hours
      } else {
        projectMap[pid].draftHours += hours
      }
    }

    const summary = Object.values(projectMap).map(s => ({
      ...s,
      approvedHours: Math.round(s.approvedHours * 100) / 100,
      pendingHours:  Math.round(s.pendingHours  * 100) / 100,
      draftHours:    Math.round(s.draftHours    * 100) / 100,
      approvedRevenue: Math.round(s.approvedRevenue * 100) / 100,
    }))

    cachedEntriesRef.current = entries || []
    const approvedSet = new Set<string>()
    for (const ts of timesheets || []) {
      if (ts.status === 'approved') approvedSet.add(`${ts.user_id}:${ts.week_start}`)
    }
    cachedApprovedSet.current = approvedSet
    setHoursSummary(summary)
    setSummaryLoading(false)
  }, [clientId, projectId, fromDate, toDate, workspaceId, supabase])

  useEffect(() => { loadHoursSummary() }, [loadHoursSummary])

  const totalApproved = hoursSummary.reduce((s, p) => s + p.approvedHours, 0)
  const totalPending  = hoursSummary.reduce((s, p) => s + p.pendingHours,  0)
  const totalDraft    = hoursSummary.reduce((s, p) => s + p.draftHours,    0)
  const selectedVat   = VAT_OPTIONS[vatRateIdx]
  const selectedClient = clients.find(c => c.id === clientId)

  async function generate() {
    if (totalApproved === 0) return
    setLoading(true)
    const approvedEntries = cachedEntriesRef.current.filter((e: any) => {
      const weekStart = format(startOfWeek(new Date(e.start_time), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      return cachedApprovedSet.current.has(`${e.user_id}:${weekStart}`)
    })
    const groups: Record<string, { project: any; entries: any[] }> = {}
    for (const e of approvedEntries) {
      if (!groups[e.project_id]) groups[e.project_id] = { project: e.project, entries: [] }
      groups[e.project_id].entries.push(e)
    }
    const newLines: InvoiceLine[] = Object.values(groups).map(({ project, entries }) => {
      const totalSecs   = entries.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0)
      const totalAmount = entries.reduce((s: number, e: any) => {
        const levelRate = e.level_id ? (e.project?.level_rates?.find((r: any) => r.level_id === e.level_id)?.hourly_rate || 0) : 0
        return s + ((e.duration_sec || 0) / 3600) * (e.hourly_rate || levelRate || project?.hourly_rate || 0)
      }, 0)
      const hours = totalSecs / 3600
      const amt = Math.round(totalAmount * 100) / 100
      return {
        description: project.name,
        hours: Math.round(hours * 100) / 100,
        rate: Math.round((hours > 0 ? totalAmount / hours : project?.hourly_rate || 0) * 100) / 100,
        amount: amt,
        vat_rate: selectedVat.value,
        vat_amount: Math.round(amt * selectedVat.value / 100 * 100) / 100,
      }
    })
    setLines(newLines)
    setGenerated(true)
    setLoading(false)
  }

  async function saveInvoice() {
    if (!generated || !clientId || !profile) return
    setSaving(true)
    const subtotalVal = lines.reduce((s, l) => s + l.amount, 0)
    const vatAmountVal = Math.round(subtotalVal * selectedVat.value / 100 * 100) / 100
    const payload = {
      workspace_id: workspaceId, user_id: profile.id,
      invoice_number: invoiceNumber, client_id: clientId,
      client_name: selectedClient?.name || '',
      issue_date: issueDate, due_date: dueDate,
      period_from: fromDate, period_to: toDate,
      subtotal: subtotalVal, vat_rate: selectedVat.value,
      vat_amount: vatAmountVal, total: subtotalVal + vatAmountVal,
      currency: 'EUR', notes, status: 'sent' as const, lines,
      seller_snapshot: workspace,
      buyer_snapshot: selectedClient ? {
        name: selectedClient.name, email: selectedClient.email,
        address_street: selectedClient.address_street, address_city: selectedClient.address_city,
        address_zip: selectedClient.address_zip, address_country: selectedClient.address_country,
        vat_id: selectedClient.vat_id,
      } : null,
      payment_iban: workspace?.iban ?? null, payment_bic: workspace?.bic ?? null,
      order_reference: orderReference || null,
      sent_at: new Date().toISOString(), paid_at: null,
    }
    const { data, error } = await supabase.from('invoices').insert(payload).select().single()
    if (error) { console.error('Invoice save failed:', error.message); setSaving(false); return }
    if (data) { onSaved(data as SavedInvoice); setGenerated(false); setLines([]) }
    setSaving(false)
  }

  const subtotal  = lines.reduce((s, l) => s + l.amount, 0)
  const vatAmount = Math.round(subtotal * selectedVat.value / 100 * 100) / 100
  const total     = subtotal + vatAmount

  return (
    <>
      {/* Settings form */}
      <div className="card p-6 mb-5 print:hidden">
        <h2 className="font-semibold text-foreground text-sm mb-4">{t('invoiceSettings')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="label">{t('client')} *</label>
            <select className="input" value={clientId} onChange={e => { setClientId(e.target.value); setGenerated(false) }}>
              <option value="">{t('selectClient')}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {clientId && (
            <div>
              <label className="label flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> {t('projectCol')}</label>
              <select className="input" value={projectId} onChange={e => { setProjectId(e.target.value); setGenerated(false) }}>
                <option value="all">All projects</option>
                {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div><label className="label">{t('fromDate')}</label><input type="date" className="input" value={fromDate} onChange={e => { setFromDate(e.target.value); setGenerated(false) }} /></div>
          <div><label className="label">{t('toDate')}</label><input type="date" className="input" value={toDate} onChange={e => { setToDate(e.target.value); setGenerated(false) }} /></div>
          <div><label className="label">{t('invoiceNumber')}</label><input className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} /></div>
          <div><label className="label">{t('issueDate')}</label><input type="date" className="input" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
          <div><label className="label">{t('dueDate')}</label><input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          <div>
            <label className="label">Steuersatz (USt.)</label>
            <select className="input" value={vatRateIdx} onChange={e => { setVatRateIdx(Number(e.target.value)); setGenerated(false) }}>
              {VAT_OPTIONS.map((v, i) => <option key={i} value={i}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Bestellreferenz <span className="text-muted-foreground/50">(ebInterface)</span></label>
            <input className="input" placeholder="Auftragsnummer, PO-Nr. …" value={orderReference} onChange={e => setOrderReference(e.target.value)} />
          </div>
          <div className="col-span-2 md:col-span-3">
            <label className="label">{t('notesPayment')}</label>
            <textarea className="input resize-none" rows={2} placeholder="Zahlungshinweise, Anmerkungen …" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {workspace !== null && (!workspace.vat_id || !workspace.iban) && (
          <div className="mt-4 flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Für EN 16931 konforme Rechnungen bitte{' '}
              {!workspace?.vat_id && <strong>UID-Nummer</strong>}
              {!workspace?.vat_id && !workspace?.iban && ' und '}
              {!workspace?.iban && <strong>IBAN</strong>}
              {' '}in den <a href="/settings" className="underline">Einstellungen → Unternehmensdaten</a> hinterlegen.
            </p>
          </div>
        )}
      </div>

      {/* Hours summary */}
      {clientId && (
        <div className="card p-5 mb-5 print:hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours available to bill</h2>
            {summaryLoading && <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />}
          </div>

          {!summaryLoading && hoursSummary.length === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center py-4">{t('noBillableTimePeriod')}</p>
          )}

          {!summaryLoading && hoursSummary.length > 0 && (
            <>
              <div className="space-y-0 rounded-lg border border-border overflow-hidden mb-4">
                <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="col-span-2">{t('projectCol')}</span>
                  <span className="text-right text-emerald-600">{t('approvedCol')}</span>
                  <span className="text-right text-amber-500">{t('pendingCol')}</span>
                  <span className="text-right text-muted-foreground">{t('notSubmittedCol')}</span>
                </div>
                {hoursSummary.map(p => (
                  <div key={p.projectId} className="grid grid-cols-5 gap-2 px-4 py-3 border-t border-border items-center">
                    <div className="col-span-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs font-medium text-foreground truncate">{p.projectName}</span>
                    </div>
                    <div className="text-right">
                      {p.approvedHours > 0 ? (
                        <div>
                          <span className="text-xs font-semibold text-emerald-600">{p.approvedHours.toFixed(1)}h</span>
                          <p className="text-[10px] text-emerald-600/70">{formatMoney(p.approvedRevenue)}</p>
                        </div>
                      ) : <span className="text-xs text-muted-foreground/40">—</span>}
                    </div>
                    <div className="text-right">
                      {p.pendingHours > 0 ? <span className="text-xs font-medium text-amber-500">{p.pendingHours.toFixed(1)}h</span> : <span className="text-xs text-muted-foreground/40">—</span>}
                    </div>
                    <div className="text-right">
                      {p.draftHours > 0 ? <span className="text-xs text-muted-foreground">{p.draftHours.toFixed(1)}h</span> : <span className="text-xs text-muted-foreground/40">—</span>}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-5 gap-2 px-4 py-3 border-t-2 border-border bg-muted/20 items-center">
                  <span className="col-span-2 text-xs font-semibold text-foreground">{t('totalRow')}</span>
                  <div className="text-right"><span className="text-xs font-bold text-emerald-600">{totalApproved.toFixed(1)}h</span></div>
                  <div className="text-right"><span className="text-xs font-bold text-amber-500">{totalPending.toFixed(1)}h</span></div>
                  <div className="text-right"><span className="text-xs font-bold text-muted-foreground">{totalDraft.toFixed(1)}h</span></div>
                </div>
              </div>

              {totalApproved > 0 && (
                <div className="flex items-start gap-2.5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    <span className="font-semibold">{totalApproved.toFixed(1)}h {t('readyToInvoice')}</span>
                    {totalPending > 0 && <span className="text-emerald-600/70"> {totalPending.toFixed(1)}h {t('pendingNotIncluded')}</span>}
                  </p>
                </div>
              )}
              {totalApproved === 0 && totalPending > 0 && (
                <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400"><span className="font-semibold">{t('noApprovedYet')}</span> {totalPending.toFixed(1)}h {t('pendingAwaitingApproval')}</p>
                </div>
              )}
              {totalApproved === 0 && totalPending === 0 && hoursSummary.length > 0 && (
                <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400"><span className="font-semibold">{t('noApprovedHours')}</span> {t('mustBeApproved')}</p>
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button onClick={generate} disabled={loading || !clientId || totalApproved === 0 || summaryLoading} className="btn-primary flex items-center gap-2 disabled:opacity-40">
              <FileText className="w-4 h-4" /> {loading ? t('generating') : t('generateApprovedOnly')}
            </button>
            {generated && (
              <>
                <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2">
                  <Download className="w-4 h-4" /> {t('printPDF')}
                </button>
                <button onClick={saveInvoice} disabled={saving} className="btn-primary flex items-center gap-2">
                  <Send className="w-4 h-4" /> {saving ? t('saving2') : t('saveInvoice')}
                </button>
                <button
                  onClick={() => exportBMDNTCS(
                    { id: '', invoice_number: invoiceNumber, client_name: selectedClient?.name || '', client_id: clientId, issue_date: issueDate, due_date: dueDate, period_from: fromDate, period_to: toDate, subtotal, vat_rate: selectedVat.value, vat_amount: vatAmount, total, notes, status: 'draft', lines, seller_snapshot: workspace, buyer_snapshot: selectedClient ?? null, payment_iban: workspace?.iban ?? null, payment_bic: workspace?.bic ?? null, order_reference: orderReference || null, sent_at: null, paid_at: null, created_at: new Date().toISOString() },
                    taxCode, revenueAccount, debitorAccount
                  )}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Package className="w-4 h-4" /> BMD
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Invoice preview */}
      {generated && (
        <div className="card p-10 bg-white dark:bg-[hsl(217.2,32.6%,10%)]" id="invoice-preview">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">RECHNUNG</h2>
              <p className="text-gray-400 text-sm">Nr. {invoiceNumber}</p>
              {orderReference && <p className="text-gray-400 text-xs mt-0.5">Ref.: {orderReference}</p>}
            </div>
            <div className="text-right">
              {sellerBlock(workspace, profile?.full_name ?? null, profile?.email ?? null).map((l, i) => (
                <p key={i} className={i === 0 ? 'font-bold text-gray-900 dark:text-white text-base' : 'text-gray-400 text-xs mt-0.5'}>{l}</p>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-10">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Rechnungsempfänger</p>
              {buyerBlock(selectedClient ?? null).map((l, i) => (
                <p key={i} className={i === 0 ? 'font-semibold text-gray-900 dark:text-white text-base' : 'text-gray-500 dark:text-gray-400 text-sm mt-0.5'}>{l}</p>
              ))}
            </div>
            <div className="text-right space-y-1">
              <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">Rechnungsdatum</span><span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{format(new Date(issueDate), 'dd.MM.yyyy')}</span></div>
              <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">Fällig am</span><span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{format(new Date(dueDate), 'dd.MM.yyyy')}</span></div>
              <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">Zeitraum</span><span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{format(new Date(fromDate), 'dd.MM.')} – {format(new Date(toDate), 'dd.MM.yyyy')}</span></div>
            </div>
          </div>

          <table className="w-full mb-8">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Beschreibung</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Stunden</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Preis/h</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Netto</th>
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
            <div className="w-72">
              <div className="flex justify-between py-2 text-sm"><span className="text-gray-500">Nettobetrag</span><span className="font-medium text-gray-900 dark:text-white">{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between py-2 text-sm border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-500">USt. {selectedVat.value}% ({selectedVat.taxCode})</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatMoney(vatAmount)}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-gray-900 dark:border-gray-400 mt-1">
                <span className="font-bold text-gray-900 dark:text-white text-lg">Gesamtbetrag</span>
                <span className="font-bold text-gray-900 dark:text-white text-lg">{formatMoney(total)}</span>
              </div>
            </div>
          </div>

          {workspace?.iban && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-6 mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bankverbindung</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{workspace.legal_name || ''}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">IBAN: {workspace.iban}{workspace.bic ? ` · BIC: ${workspace.bic}` : ''}</p>
            </div>
          )}

          {notes && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Anmerkungen</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{notes}</p>
            </div>
          )}

          <div className="mt-10 text-center"><p className="text-xs text-gray-300">Erstellt mit Kairos · EN 16931 konform</p></div>
        </div>
      )}
    </>
  )
}
