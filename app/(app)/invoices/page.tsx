'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useRouter } from 'next/navigation'
import { type Client, type Project, formatMoney } from '@/lib/types'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { FileText, Download } from 'lucide-react'

type InvoiceLine = { description: string; hours: number; rate: number; amount: number }

export default function InvoicesPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const router = useRouter()

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
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

  async function generate() {
    if (!clientId) { alert('Please select a client'); return }
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
      alert('No billable entries found for this client in the selected period.')
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

    setLines(newLines); setGenerated(true); setLoading(false)
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const selectedClient = clients.find(c => c.id === clientId)

  if (role === 'member') return null

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm mt-1">Generate invoices from your team's tracked time.</p>
        </div>
      </div>

      <div className="card p-6 mb-6 print:hidden">
        <h2 className="font-semibold text-gray-800 mb-4">Invoice settings</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Client *</label>
            <select className="input" value={clientId} onChange={e => { setClientId(e.target.value); setGenerated(false) }}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">From date</label><input type="date" className="input" value={fromDate} onChange={e => { setFromDate(e.target.value); setGenerated(false) }} /></div>
          <div><label className="label">To date</label><input type="date" className="input" value={toDate} onChange={e => { setToDate(e.target.value); setGenerated(false) }} /></div>
          <div><label className="label">Invoice number</label><input className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} /></div>
          <div><label className="label">Issue date</label><input type="date" className="input" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
          <div><label className="label">Due date</label><input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          <div className="col-span-2 md:col-span-3">
            <label className="label">Notes / payment details</label>
            <textarea className="input resize-none" rows={2} placeholder="e.g. IBAN AT12 3456 7890 · Payment within 30 days" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={generate} disabled={loading || !clientId} className="btn-primary flex items-center gap-2">
            <FileText className="w-4 h-4" /> {loading ? 'Generating…' : 'Generate invoice'}
          </button>
          {generated && (
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> Print / Save PDF
            </button>
          )}
        </div>
      </div>

      {generated && (
        <div className="card p-10" id="invoice-preview">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">INVOICE</h2>
              <p className="text-gray-400 text-sm">#{invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900 text-lg">{profile?.full_name || profile?.email}</p>
              <p className="text-gray-400 text-sm mt-1">{profile?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-10">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bill to</p>
              <p className="font-semibold text-gray-900 text-lg">{selectedClient?.name}</p>
              {selectedClient?.email && <p className="text-gray-400 text-sm mt-1">{selectedClient.email}</p>}
            </div>
            <div className="text-right space-y-1">
              <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">Issue date</span><span className="text-sm text-gray-700 font-medium">{format(new Date(issueDate), 'MMM d, yyyy')}</span></div>
              <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">Due date</span><span className="text-sm text-gray-700 font-medium">{format(new Date(dueDate), 'MMM d, yyyy')}</span></div>
              <div className="flex justify-end gap-8"><span className="text-xs text-gray-400 uppercase tracking-wider">Period</span><span className="text-sm text-gray-700 font-medium">{format(new Date(fromDate), 'MMM d')} – {format(new Date(toDate), 'MMM d, yyyy')}</span></div>
            </div>
          </div>

          <table className="w-full mb-8">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Description</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Hours</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Rate</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-4 text-gray-900 font-medium">{line.description}</td>
                  <td className="py-4 text-right text-gray-600">{line.hours.toFixed(2)}h</td>
                  <td className="py-4 text-right text-gray-600">{formatMoney(line.rate)}/h</td>
                  <td className="py-4 text-right font-semibold text-gray-900">{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-2"><span className="text-gray-500">Subtotal</span><span className="font-medium text-gray-900">{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between py-3 border-t-2 border-gray-900 mt-1"><span className="font-bold text-gray-900 text-lg">Total</span><span className="font-bold text-gray-900 text-lg">{formatMoney(subtotal)}</span></div>
            </div>
          </div>

          {notes && (
            <div className="border-t border-gray-100 pt-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{notes}</p>
            </div>
          )}
          <div className="mt-10 text-center"><p className="text-xs text-gray-300">Generated by Kairos</p></div>
        </div>
      )}

      <style>{`@media print { nav, aside, .print\\:hidden { display: none !important; } #invoice-preview { box-shadow: none; border: none; } }`}</style>
    </div>
  )
}