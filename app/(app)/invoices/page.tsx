'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { type Client, type Project, formatMoney } from '@/lib/types'
import { format, startOfMonth, endOfMonth, startOfWeek } from 'date-fns'
import {
  FileText, Download, Send, CheckCircle, Clock, Package,
  Search, X, Pencil, Trash2, Check, AlertTriangle, ShieldCheck, FolderOpen,
} from 'lucide-react'

type InvoiceLine = { description: string; hours: number; rate: number; amount: number }
type InvoiceStatus = 'draft' | 'sent' | 'paid'

type HoursSummary = {
  projectId: string
  projectName: string
  color: string
  approvedHours: number
  pendingHours: number
  draftHours: number
  approvedRevenue: number
  rate: number
}

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
  const header = 'Buchungskreis;Datum;Belegnummer;Buchungstext;Betrag;Steuercode;Debitorenkonto;Erlöskonto'
  const rows = invoice.lines.map(line =>
    ['1', formatGermanDate(invoice.issue_date), invoice.invoice_number,
      `"${invoice.client_name} - ${line.description}"`,
      formatGermanAmount(line.amount), taxCode || 'U20', debitorAccount || '10000', revenueAccount || '4000',
    ].join(';')
  )
  const content = [header, ...rows].join('\r\n')
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `BMD_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
  a.click(); URL.revokeObjectURL(url)
}

export default function InvoicesPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const router = useRouter()
  const { t } = useI18n()

  const [clients, setClients] = useState<Client[]>([])
  const [clientProjects, setClientProjects] = useState<Project[]>([])
  const [profile, setProfile] = useState<{ id: string; full_name: string | null; email: string | null } | null>(null)
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('all')
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${format(new Date(), 'yyyyMM')}-001`)
  const [issueDate, setIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [hoursSummary, setHoursSummary] = useState<HoursSummary[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  // Cache fetched data so generate() reuses it without a second round-trip
  const cachedEntriesRef = useRef<any[]>([])
  const cachedApprovedSet = useRef<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<InvoiceStatus>('draft')
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([])
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingInvoice, setEditingInvoice] = useState<SavedInvoice | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const [taxCode, setTaxCode] = useState('')
  const [revenueAccount, setRevenueAccount] = useState('')
  const [debitorAccount, setDebitorAccount] = useState('')

  useEffect(() => {
    setTaxCode(localStorage.getItem('kairos-bmd-taxcode') || 'U20')
    setRevenueAccount(localStorage.getItem('kairos-bmd-revenue') || '4000')
    setDebitorAccount(localStorage.getItem('kairos-bmd-debitor') || '10000')
  }, [])

  useEffect(() => {
    if (role === 'member' || role === 'project_manager') router.push('/dashboard')
  }, [role, router])

  const load = useCallback(async () => {
    if (!workspaceId || (role !== 'admin' && role !== 'partner')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: cl }, { data: prof }] = await Promise.all([
      supabase.from('clients').select('*').eq('workspace_id', workspaceId).order('name'),
      supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single(),
    ])
    setClients(cl || [])
    setProfile(prof ?? { id: user.id, full_name: user.email ?? null, email: user.email ?? null })
    const { data: inv } = await supabase.from('invoices').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    setSavedInvoices((inv as SavedInvoice[]) || [])
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

  // Load projects when client changes
  useEffect(() => {
    setProjectId('all')
    setClientProjects([])
    setHoursSummary([])
    setGenerated(false)
    if (!clientId || !workspaceId) return
    supabase.from('projects').select('*').eq('workspace_id', workspaceId).eq('client_id', clientId).eq('status', 'active').is('deleted_at', null).order('name')
      .then(({ data }) => setClientProjects(data || []))
  }, [clientId, workspaceId])

  // Build hours summary whenever client/project/dates change
  const loadHoursSummary = useCallback(async () => {
    if (!clientId || !workspaceId) { setHoursSummary([]); return }
    setSummaryLoading(true)
    setGenerated(false)

    const toEnd = new Date(toDate); toEnd.setHours(23, 59, 59)

    // Fetch all billable entries for this client in range (include level_rates for rate fallback)
    let query = supabase
      .from('time_entries')
      .select('*, project:projects!inner(*, client:clients(*), level_rates:project_level_rates(level_id, hourly_rate))')
      .eq('workspace_id', workspaceId)
      .eq('billable', true)
      .not('end_time', 'is', null)
      .gte('start_time', new Date(fromDate).toISOString())
      .lte('start_time', toEnd.toISOString())
      .eq('project.client_id', clientId)

    if (projectId !== 'all') {
      query = query.eq('project_id', projectId)
    }

    const { data: entries } = await query

    // Fetch all timesheets in workspace to know approval status per user/week
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select('user_id, week_start, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['approved', 'submitted', 'draft', 'rejected'])

    // Build lookup: userId:weekStart -> status
    const tsStatusMap: Record<string, string> = {}
    for (const ts of timesheets || []) {
      tsStatusMap[`${ts.user_id}:${ts.week_start}`] = ts.status
    }

    // Group entries by project, classify by approval status
    const projectMap: Record<string, HoursSummary> = {}
    for (const e of (entries || []) as any[]) {
      const pid = e.project_id
      if (!projectMap[pid]) {
        projectMap[pid] = {
          projectId: pid,
          projectName: e.project?.name || 'Unknown',
          color: e.project?.color || '#6366f1',
          approvedHours: 0,
          pendingHours: 0,
          draftHours: 0,
          approvedRevenue: 0,
          rate: e.project?.hourly_rate || 0,
        }
      }
      const weekStart = format(startOfWeek(new Date(e.start_time), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const tsStatus = tsStatusMap[`${e.user_id}:${weekStart}`] || 'draft'
      const hours = (e.duration_sec || 0) / 3600

      if (tsStatus === 'approved') {
        projectMap[pid].approvedHours += hours
        const levelRate = e.level_id ? (e.project?.level_rates?.find((r: any) => r.level_id === e.level_id)?.hourly_rate || 0) : 0
        const effectiveRate = e.hourly_rate || levelRate || e.project?.hourly_rate || 0
        projectMap[pid].approvedRevenue += hours * effectiveRate
      } else if (tsStatus === 'submitted') {
        projectMap[pid].pendingHours += hours
      } else {
        projectMap[pid].draftHours += hours
      }
    }

    // Round
    const summary = Object.values(projectMap).map(s => ({
      ...s,
      approvedHours: Math.round(s.approvedHours * 100) / 100,
      pendingHours: Math.round(s.pendingHours * 100) / 100,
      draftHours: Math.round(s.draftHours * 100) / 100,
      approvedRevenue: Math.round(s.approvedRevenue * 100) / 100,
    }))

    // Cache for generate() to reuse — avoids a second identical round-trip
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
  const totalPending  = hoursSummary.reduce((s, p) => s + p.pendingHours, 0)
  const totalDraft    = hoursSummary.reduce((s, p) => s + p.draftHours, 0)

  async function generate() {
    if (totalApproved === 0) return
    setLoading(true)

    // Reuse cached data from loadHoursSummary — no second round-trip needed
    const entries = cachedEntriesRef.current
    const approvedSet = cachedApprovedSet.current

    // Filter to approved entries only
    const approvedEntries = entries.filter((e: any) => {
      const weekStart = format(startOfWeek(new Date(e.start_time), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      return approvedSet.has(`${e.user_id}:${weekStart}`)
    })

    // Group by project
    const projectGroups: Record<string, { project: any; entries: any[] }> = {}
    for (const e of approvedEntries) {
      if (!projectGroups[e.project_id]) projectGroups[e.project_id] = { project: e.project, entries: [] }
      projectGroups[e.project_id].entries.push(e)
    }

    const newLines: InvoiceLine[] = Object.values(projectGroups).map(({ project, entries }) => {
      const totalSecs = entries.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0)
      const totalAmount = entries.reduce((s: number, e: any) => {
        const levelRate = e.level_id ? (e.project?.level_rates?.find((r: any) => r.level_id === e.level_id)?.hourly_rate || 0) : 0
        const effectiveRate = e.hourly_rate || levelRate || project?.hourly_rate || 0
        return s + ((e.duration_sec || 0) / 3600) * effectiveRate
      }, 0)
      const hours = totalSecs / 3600
      const blendedRate = hours > 0 ? totalAmount / hours : (project?.hourly_rate || 0)
      return { description: project.name, hours: Math.round(hours * 100) / 100, rate: Math.round(blendedRate * 100) / 100, amount: Math.round(totalAmount * 100) / 100 }
    })

    setLines(newLines)
    setCurrentStatus('draft')
    setGenerated(true)
    setLoading(false)
  }

  async function saveInvoice() {
    if (!generated || !clientId || !profile) return
    setSaving(true)
    const selectedClient = clients.find(c => c.id === clientId)
    const payload = {
      workspace_id: workspaceId,
      user_id: profile.id,
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
    const { data, error } = await supabase.from('invoices').insert(payload).select().single()
    if (error) { console.error('Invoice save failed:', error.message); setSaving(false); return }
    if (data) {
      setSavedInvoices(prev => [data as SavedInvoice, ...prev])
      setGenerated(false); setLines([])
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

  async function deleteInvoice(id: string) {
    await supabase.from('invoices').delete().eq('id', id)
    setSavedInvoices(prev => prev.filter(inv => inv.id !== id))
    setDeleteConfirmId(null)
  }

  async function saveEditInvoice() {
    if (!editingInvoice) return
    const update = { invoice_number: editingInvoice.invoice_number, due_date: editingInvoice.due_date, notes: editingInvoice.notes }
    await supabase.from('invoices').update(update).eq('id', editingInvoice.id)
    setSavedInvoices(prev => prev.map(inv => inv.id === editingInvoice.id ? { ...inv, ...update } : inv))
    setEditingInvoice(null)
  }

  async function downloadPDF(inv: SavedInvoice) {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = 210, ml = 20, mr = 190
    doc.setFontSize(28).setFont('helvetica', 'bold').text('INVOICE', ml, 28)
    doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(150).text(`#${inv.invoice_number}`, ml, 36)
    doc.setTextColor(30).setFontSize(11).setFont('helvetica', 'bold').text(profile?.full_name || profile?.email || 'Consulting', mr, 24, { align: 'right' })
    doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(120)
    if (profile?.email) doc.text(profile.email, mr, 30, { align: 'right' })
    doc.setDrawColor(220).setLineWidth(0.4).line(ml, 44, mr, 44)
    doc.setFontSize(8).setTextColor(150).setFont('helvetica', 'bold').text('BILL TO', ml, 53)
    doc.setFontSize(11).setTextColor(30).setFont('helvetica', 'normal').text(inv.client_name, ml, 60)
    const labelX = 130, valX = mr
    const row = (label: string, val: string, y: number) => {
      doc.setFontSize(8).setTextColor(150).setFont('helvetica', 'bold').text(label, labelX, y)
      doc.setFontSize(9).setTextColor(30).setFont('helvetica', 'normal').text(val, valX, y, { align: 'right' })
    }
    row('ISSUE DATE', format(new Date(inv.issue_date), 'MMM d, yyyy'), 53)
    row('DUE DATE', format(new Date(inv.due_date), 'MMM d, yyyy'), 60)
    row('PERIOD', `${format(new Date(inv.period_from), 'MMM d')} – ${format(new Date(inv.period_to), 'MMM d, yyyy')}`, 67)
    let y = 82
    doc.setFillColor(245, 246, 248).rect(ml, y - 5, mr - ml, 8, 'F')
    doc.setFontSize(8).setTextColor(100).setFont('helvetica', 'bold')
    doc.text('DESCRIPTION', ml + 2, y); doc.text('HOURS', 130, y, { align: 'right' })
    doc.text('RATE', 155, y, { align: 'right' }); doc.text('AMOUNT', mr, y, { align: 'right' })
    y += 6; doc.setDrawColor(210).setLineWidth(0.3)
    for (const line of inv.lines) {
      doc.line(ml, y, mr, y); y += 5
      doc.setFontSize(10).setTextColor(30).setFont('helvetica', 'normal').text(line.description, ml + 2, y)
      doc.setTextColor(90).text(`${line.hours.toFixed(2)}h`, 130, y, { align: 'right' }).text(`€${line.rate.toFixed(2)}/h`, 155, y, { align: 'right' })
      doc.setTextColor(30).setFont('helvetica', 'bold').text(`€${line.amount.toFixed(2)}`, mr, y, { align: 'right' })
      doc.setFont('helvetica', 'normal'); y += 7
    }
    y += 4; doc.line(ml, y, mr, y); y += 6
    doc.setFontSize(9).setTextColor(100).text('Subtotal', 145, y)
    doc.setTextColor(30).text(`€${inv.subtotal.toFixed(2)}`, mr, y, { align: 'right' })
    y += 8; doc.setDrawColor(30).setLineWidth(0.6).line(130, y, mr, y); y += 7
    doc.setFontSize(12).setFont('helvetica', 'bold').setTextColor(30).text('Total', 145, y).text(`€${inv.subtotal.toFixed(2)}`, mr, y, { align: 'right' })
    if (inv.notes) {
      y += 16; doc.setDrawColor(220).setLineWidth(0.3).line(ml, y, mr, y); y += 8
      doc.setFontSize(8).setTextColor(150).setFont('helvetica', 'bold').text('NOTES', ml, y); y += 5
      doc.setFontSize(9).setTextColor(80).setFont('helvetica', 'normal').text(doc.splitTextToSize(inv.notes, mr - ml), ml, y)
    }
    doc.setFontSize(8).setTextColor(180).setFont('helvetica', 'normal').text('Generated by Kairos', W / 2, 285, { align: 'center' })
    doc.save(`${inv.invoice_number}.pdf`)
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const selectedClient = clients.find(c => c.id === clientId)

  if (role === 'member' || role === 'project_manager') return null

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
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
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
              <div className="col-span-2 md:col-span-3">
                <label className="label">{t('notesPayment')}</label>
                <textarea className="input resize-none" rows={2} placeholder={t('ibanPlaceholder')} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Hours summary — only when client is selected */}
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
                  {/* Per-project breakdown */}
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
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
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
                          {p.pendingHours > 0
                            ? <span className="text-xs font-medium text-amber-500">{p.pendingHours.toFixed(1)}h</span>
                            : <span className="text-xs text-muted-foreground/40">—</span>}
                        </div>
                        <div className="text-right">
                          {p.draftHours > 0
                            ? <span className="text-xs text-muted-foreground">{p.draftHours.toFixed(1)}h</span>
                            : <span className="text-xs text-muted-foreground/40">—</span>}
                        </div>
                      </div>
                    ))}
                    {/* Totals row */}
                    <div className="grid grid-cols-5 gap-2 px-4 py-3 border-t-2 border-border bg-muted/20 items-center">
                      <span className="col-span-2 text-xs font-semibold text-foreground">{t('totalRow')}</span>
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-600">{totalApproved.toFixed(1)}h</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-amber-500">{totalPending.toFixed(1)}h</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-muted-foreground">{totalDraft.toFixed(1)}h</span>
                      </div>
                    </div>
                  </div>

                  {/* Status callouts */}
                  {totalApproved > 0 && (
                    <div className="flex items-start gap-2.5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-3">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        <span className="font-semibold">{totalApproved.toFixed(1)}h {t('readyToInvoice')}</span>
                        {totalPending > 0 && <span className="text-emerald-600/70"> {totalPending.toFixed(1)}h {t('pendingNotIncluded')}</span>}
                      </p>
                    </div>
                  )}
                  {totalApproved === 0 && totalPending > 0 && (
                    <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        <span className="font-semibold">{t('noApprovedYet')}</span> {totalPending.toFixed(1)}h {t('pendingAwaitingApproval')}
                      </p>
                    </div>
                  )}
                  {totalApproved === 0 && totalPending === 0 && hoursSummary.length > 0 && (
                    <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        <span className="font-semibold">{t('noApprovedHours')}</span> {t('mustBeApproved')}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <button
                  onClick={generate}
                  disabled={loading || !clientId || totalApproved === 0 || summaryLoading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40"
                  title={totalApproved === 0 ? 'No approved hours to invoice' : ''}
                >
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
          )}

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
          {savedInvoices.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input className="input pl-9 pr-8 text-sm" placeholder="Search by client, invoice number, status…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
            </div>
          )}
          {savedInvoices.length === 0 ? (
            <div className="card p-12 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{t('noSavedInvoices')}</p>
            </div>
          ) : savedInvoices
              .filter(inv => {
                if (!searchQuery.trim()) return true
                const q = searchQuery.toLowerCase()
                return inv.invoice_number.toLowerCase().includes(q) || inv.client_name.toLowerCase().includes(q) || inv.status.includes(q)
              })
              .map(inv => (
            <div key={inv.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-foreground text-sm">{inv.invoice_number}</span>
                    {statusBadge(inv.status, t)}
                  </div>
                  <p className="text-sm text-muted-foreground">{inv.client_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(inv.issue_date), 'MMM d, yyyy')} · Due {format(new Date(inv.due_date), 'MMM d, yyyy')} · {t('period')}: {format(new Date(inv.period_from), 'MMM d')} – {format(new Date(inv.period_to), 'MMM d, yyyy')}
                  </p>
                  {inv.notes && <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{inv.notes}</p>}
                  {inv.lines && inv.lines.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {inv.lines.map((l, i) => (
                        <span key={i} className="text-[10px] bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-md">
                          {l.description} · {l.hours.toFixed(1)}h · {formatMoney(l.amount)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-foreground">{formatMoney(inv.subtotal)}</p>
                  <div className="flex gap-2 mt-2 justify-end flex-wrap">
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
                    <button onClick={() => setEditingInvoice(inv)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1">
                      <Pencil className="w-3 h-3" />
                    </button>
                    {deleteConfirmId === inv.id ? (
                      <>
                        <button onClick={() => deleteInvoice(inv.id)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10"><Check className="w-3 h-3" /> Confirm</button>
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
        </div>
      )}

      {/* Edit invoice modal */}
      {editingInvoice && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-semibold text-foreground mb-5 text-sm">Edit Invoice</h3>
            <div className="space-y-4">
              <div><label className="label">Invoice Number</label><input className="input" value={editingInvoice.invoice_number} onChange={e => setEditingInvoice({ ...editingInvoice, invoice_number: e.target.value })} /></div>
              <div><label className="label">{t('dueDate')}</label><input type="date" className="input" value={editingInvoice.due_date} onChange={e => setEditingInvoice({ ...editingInvoice, due_date: e.target.value })} /></div>
              <div><label className="label">{t('notesPayment')}</label><textarea className="input resize-none" rows={3} value={editingInvoice.notes || ''} onChange={e => setEditingInvoice({ ...editingInvoice, notes: e.target.value })} /></div>
              <div>
                <p className="label mb-2">Line items (read-only)</p>
                <div className="rounded-lg border border-border divide-y divide-border text-xs">
                  {editingInvoice.lines.map((l, i) => (
                    <div key={i} className="flex justify-between px-3 py-2 text-muted-foreground">
                      <span>{l.description} · {l.hours.toFixed(2)}h</span>
                      <span className="font-medium text-foreground">{formatMoney(l.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-3 py-2 font-semibold text-foreground">
                    <span>Total</span><span>{formatMoney(editingInvoice.subtotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={saveEditInvoice} className="btn-primary flex items-center gap-2 text-sm"><Check className="w-3.5 h-3.5" />{t('saveChanges')}</button>
              <button onClick={() => setEditingInvoice(null)} className="btn-secondary text-sm">{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media print { nav, aside, .print\\:hidden { display: none !important; } #invoice-preview { box-shadow: none; border: none; } }`}</style>
    </div>
  )
}
