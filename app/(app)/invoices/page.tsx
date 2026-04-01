'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { type Client, type Project, formatMoney } from '@/lib/types'
import { format, startOfMonth, endOfMonth, startOfWeek } from 'date-fns'
import { de as dateFnsDE, enUS as dateFnsEN } from 'date-fns/locale'
import {
  FileText, Download, Send, CheckCircle, Clock, Package,
  Search, X, Pencil, Trash2, Check, AlertTriangle, ShieldCheck, FolderOpen, Code2,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceLine = {
  description: string
  hours: number
  rate: number
  amount: number
  vat_rate: number    // e.g. 20, 10, 0
  vat_amount: number
}

type InvoiceStatus = 'draft' | 'sent' | 'paid'

type WorkspaceLegal = {
  legal_name: string | null
  address_street: string | null
  address_city: string | null
  address_zip: string | null
  address_country: string | null
  vat_id: string | null
  iban: string | null
  bic: string | null
}

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
  vat_rate: number
  vat_amount: number
  total: number
  notes: string
  status: InvoiceStatus
  lines: InvoiceLine[]
  seller_snapshot: WorkspaceLegal | null
  buyer_snapshot: Partial<Client> | null
  payment_iban: string | null
  payment_bic: string | null
  order_reference: string | null
  sent_at: string | null
  paid_at: string | null
  created_at: string
}

// ── VAT options ────────────────────────────────────────────────────────────────

const VAT_OPTIONS = [
  { label: '20% — Standard (Inland)',               value: 20,  taxCode: 'U20' },
  { label: '10% — Ermäßigt',                        value: 10,  taxCode: 'U10' },
  { label: '0% — EU-Leistung (§ 3a UStG)',          value: 0,   taxCode: 'IG'  },
  { label: '0% — Reverse Charge (§ 19 UStG)',       value: 0,   taxCode: 'RC'  },
  { label: '0% — Export / Ausfuhrlieferung',        value: 0,   taxCode: 'AU'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function sellerBlock(ws: WorkspaceLegal | null, name: string | null, email: string | null): string[] {
  const lines: string[] = []
  if (ws?.legal_name || name) lines.push(ws?.legal_name || name || '')
  if (ws?.address_street) lines.push(ws.address_street)
  const cityLine = [ws?.address_zip, ws?.address_city].filter(Boolean).join(' ')
  if (cityLine) lines.push(cityLine)
  if (ws?.address_country) lines.push(ws.address_country)
  if (ws?.vat_id) lines.push(`UID: ${ws.vat_id}`)
  if (email) lines.push(email)
  return lines
}

function buyerBlock(client: Partial<Client> | null): string[] {
  if (!client) return []
  const lines: string[] = []
  lines.push(client.name || '')
  if (client.address_street) lines.push(client.address_street)
  const cityLine = [client.address_zip, client.address_city].filter(Boolean).join(' ')
  if (cityLine) lines.push(cityLine)
  if (client.address_country) lines.push(client.address_country)
  if (client.vat_id) lines.push(`UID: ${client.vat_id}`)
  if (client.email) lines.push(client.email)
  return lines
}

// ── BMD/NTCS Export ────────────────────────────────────────────────────────────

function exportBMDNTCS(invoice: SavedInvoice, taxCode: string, revenueAccount: string, debitorAccount: string) {
  const formatGermanDate = (d: string) => format(new Date(d), 'dd.MM.yyyy')
  const formatGermanAmount = (n: number) => n.toFixed(2).replace('.', ',')
  const tc = taxCode || 'U20'
  const header = 'Buchungskreis;Datum;Belegnummer;Buchungstext;Betrag;Steuercode;Debitorenkonto;Erlöskonto'
  const rows = invoice.lines.map(line =>
    ['1', formatGermanDate(invoice.issue_date), invoice.invoice_number,
      `"${invoice.client_name} - ${line.description}"`,
      formatGermanAmount(line.amount), tc, debitorAccount || '10000', revenueAccount || '4000',
    ].join(';')
  )
  const content = [header, ...rows].join('\r\n')
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `BMD_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── ebInterface 6.1 XML Export ────────────────────────────────────────────────

function exportEBInterface(invoice: SavedInvoice) {
  const s = invoice.seller_snapshot
  const b = invoice.buyer_snapshot
  const vatOpt = VAT_OPTIONS.find(v => v.value === invoice.vat_rate) || VAT_OPTIONS[0]
  const isReverseCharge = vatOpt.taxCode === 'RC'

  const escXml = (v: string | null | undefined) =>
    (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const sellerLines = [
    s?.legal_name ? `      <Name>${escXml(s.legal_name)}</Name>` : '',
    `      <Address>`,
    s?.address_street ? `        <Street>${escXml(s.address_street)}</Street>` : '',
    s?.address_city   ? `        <Town>${escXml(s.address_city)}</Town>` : '',
    s?.address_zip    ? `        <ZIP>${escXml(s.address_zip)}</ZIP>` : '',
    `        <Country CountryCode="${escXml(s?.address_country || 'AT')}">${escXml(s?.address_country || 'AT')}</Country>`,
    `      </Address>`,
  ].filter(Boolean).join('\n')

  const buyerLines = [
    b?.name ? `    <Name>${escXml(b.name)}</Name>` : '',
    `    <Address>`,
    b?.address_street ? `      <Street>${escXml(b.address_street)}</Street>` : '',
    b?.address_city   ? `      <Town>${escXml(b.address_city)}</Town>` : '',
    b?.address_zip    ? `      <ZIP>${escXml(b.address_zip)}</ZIP>` : '',
    `      <Country CountryCode="${escXml(b?.address_country || 'AT')}">${escXml(b?.address_country || 'AT')}</Country>`,
    `    </Address>`,
    b?.email ? `    <Contact><Phone/><Email>${escXml(b.email)}</Email></Contact>` : '',
  ].filter(Boolean).join('\n')

  const lineItems = invoice.lines.map((l, i) => `    <ListLineItem>
      <PositionNumber>${i + 1}</PositionNumber>
      <Description>${escXml(l.description)}</Description>
      <Quantity Unit="HUR">${l.hours.toFixed(4)}</Quantity>
      <UnitPrice>${l.rate.toFixed(4)}</UnitPrice>
      <VATRate TaxCode="${vatOpt.taxCode}">${l.vat_rate}.00</VATRate>
      <LineItemAmount>${l.amount.toFixed(2)}</LineItemAmount>
    </ListLineItem>`).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://www.ebinterface.at/schema/6p1/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://www.ebinterface.at/schema/6p1/ ebinterface-6p1.xsd"
         GeneratingSystemID="Kairos"
         DocumentTitle="Rechnung"
         InvoiceCurrency="${invoice.notes?.includes('USD') ? 'USD' : 'EUR'}"
         Language="ger">

  <InvoiceNumber>${escXml(invoice.invoice_number)}</InvoiceNumber>
  <InvoiceDate>${invoice.issue_date}</InvoiceDate>

  <DeliveryDate>
    <FromDate>${invoice.period_from}</FromDate>
    <ToDate>${invoice.period_to}</ToDate>
  </DeliveryDate>

  <Biller>
    ${s?.vat_id ? `<VATIdentificationNumber>${escXml(s.vat_id)}</VATIdentificationNumber>` : ''}
    <InvoicingParty>
${sellerLines}
    </InvoicingParty>
  </Biller>

  <InvoiceRecipient>
    ${b?.vat_id ? `<VATIdentificationNumber>${escXml(b.vat_id)}</VATIdentificationNumber>` : ''}
${buyerLines}
  </InvoiceRecipient>

  ${invoice.order_reference ? `<OrderReference>\n    <OrderID>${escXml(invoice.order_reference)}</OrderID>\n  </OrderReference>` : ''}

  <Details>
    <ItemList>
${lineItems}
    </ItemList>
  </Details>

  <Tax>
    <TaxItem>
      <TaxableAmount>${invoice.subtotal.toFixed(2)}</TaxableAmount>
      <TaxPercent TaxCode="${vatOpt.taxCode}">${invoice.vat_rate}.00</TaxPercent>
      <TaxAmount>${invoice.vat_amount.toFixed(2)}</TaxAmount>
      ${isReverseCharge ? '<Comment>Reverse Charge — Steuerschuldübergang gem. § 19 Abs. 1 UStG</Comment>' : ''}
    </TaxItem>
  </Tax>

  <TotalGrossAmount>${invoice.total.toFixed(2)}</TotalGrossAmount>
  <PayableAmount>${invoice.total.toFixed(2)}</PayableAmount>

  <PaymentConditions>
    <DueDate>${invoice.due_date}</DueDate>
    ${(invoice.payment_iban || s?.iban) ? `<PaymentMethods>
      <UniversalBankTransaction>
        <BeneficiaryAccount>
          <IBAN>${escXml(invoice.payment_iban || s?.iban || '')}</IBAN>
          ${(invoice.payment_bic || s?.bic) ? `<BIC>${escXml(invoice.payment_bic || s?.bic || '')}</BIC>` : ''}
          <BankAccountOwner>${escXml(s?.legal_name || '')}</BankAccountOwner>
        </BeneficiaryAccount>
      </UniversalBankTransaction>
    </PaymentMethods>` : ''}
  </PaymentConditions>

</Invoice>`

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `ebInterface_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}.xml`
  a.click(); URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const router = useRouter()
  const { t, locale } = useI18n()
  const dateFnsLocale = locale === 'de' ? dateFnsDE : dateFnsEN

  const [clients, setClients] = useState<Client[]>([])
  const [clientProjects, setClientProjects] = useState<Project[]>([])
  const [profile, setProfile] = useState<{ id: string; full_name: string | null; email: string | null } | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceLegal | null>(null)
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('all')
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${format(new Date(), 'yyyyMM')}-001`)
  const [issueDate, setIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [vatRateIdx, setVatRateIdx] = useState(0)   // index into VAT_OPTIONS
  const [orderReference, setOrderReference] = useState('')
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [hoursSummary, setHoursSummary] = useState<HoursSummary[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
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
    if (!can(role, 'manage:invoices')) router.push('/dashboard')
  }, [role, router])

  const load = useCallback(async () => {
    if (!workspaceId || !can(role, 'manage:invoices')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: cl }, { data: prof }, { data: ws }] = await Promise.all([
      supabase.from('clients').select('*').eq('workspace_id', workspaceId).order('name'),
      supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single(),
      supabase.from('workspaces').select('legal_name, address_street, address_city, address_zip, address_country, vat_id, iban, bic').eq('id', workspaceId).single(),
    ])
    setClients(cl || [])
    setProfile(prof ?? { id: user.id, full_name: user.email ?? null, email: user.email ?? null })
    setWorkspace(ws ?? null)
    const { data: inv } = await supabase.from('invoices').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    setSavedInvoices((inv as SavedInvoice[]) || [])
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

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
      .eq('workspace_id', workspaceId)
      .eq('billable', true)
      .not('end_time', 'is', null)
      .gte('start_time', new Date(fromDate).toISOString())
      .lte('start_time', toEnd.toISOString())
      .eq('project.client_id', clientId)

    if (projectId !== 'all') query = query.eq('project_id', projectId)

    const { data: entries } = await query
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select('user_id, week_start, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['approved', 'submitted', 'draft', 'rejected'])

    const tsStatusMap: Record<string, string> = {}
    for (const ts of timesheets || []) tsStatusMap[`${ts.user_id}:${ts.week_start}`] = ts.status

    const projectMap: Record<string, HoursSummary> = {}
    for (const e of (entries || []) as any[]) {
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
        const effectiveRate = e.hourly_rate || levelRate || e.project?.hourly_rate || 0
        projectMap[pid].approvedRevenue += hours * effectiveRate
      } else if (tsStatus === 'submitted') {
        projectMap[pid].pendingHours += hours
      } else {
        projectMap[pid].draftHours += hours
      }
    }

    const summary = Object.values(projectMap).map(s => ({
      ...s,
      approvedHours: Math.round(s.approvedHours * 100) / 100,
      pendingHours: Math.round(s.pendingHours * 100) / 100,
      draftHours: Math.round(s.draftHours * 100) / 100,
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
  const totalPending  = hoursSummary.reduce((s, p) => s + p.pendingHours, 0)
  const totalDraft    = hoursSummary.reduce((s, p) => s + p.draftHours, 0)

  const selectedVat = VAT_OPTIONS[vatRateIdx]

  async function generate() {
    if (totalApproved === 0) return
    setLoading(true)

    const entries = cachedEntriesRef.current
    const approvedSet = cachedApprovedSet.current

    const approvedEntries = entries.filter((e: any) => {
      const weekStart = format(startOfWeek(new Date(e.start_time), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      return approvedSet.has(`${e.user_id}:${weekStart}`)
    })

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
      const amt = Math.round(totalAmount * 100) / 100
      const vatAmt = Math.round(amt * selectedVat.value / 100 * 100) / 100
      return {
        description: project.name,
        hours: Math.round(hours * 100) / 100,
        rate: Math.round(blendedRate * 100) / 100,
        amount: amt,
        vat_rate: selectedVat.value,
        vat_amount: vatAmt,
      }
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
    const subtotalVal = lines.reduce((s, l) => s + l.amount, 0)
    const vatAmountVal = Math.round(subtotalVal * selectedVat.value / 100 * 100) / 100
    const totalVal = subtotalVal + vatAmountVal

    const sellerSnap: WorkspaceLegal = {
      legal_name: workspace?.legal_name ?? null,
      address_street: workspace?.address_street ?? null,
      address_city: workspace?.address_city ?? null,
      address_zip: workspace?.address_zip ?? null,
      address_country: workspace?.address_country ?? null,
      vat_id: workspace?.vat_id ?? null,
      iban: workspace?.iban ?? null,
      bic: workspace?.bic ?? null,
    }
    const buyerSnap = selectedClient ? {
      name: selectedClient.name,
      email: selectedClient.email,
      address_street: selectedClient.address_street,
      address_city: selectedClient.address_city,
      address_zip: selectedClient.address_zip,
      address_country: selectedClient.address_country,
      vat_id: selectedClient.vat_id,
    } : null

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
      subtotal: subtotalVal,
      vat_rate: selectedVat.value,
      vat_amount: vatAmountVal,
      total: totalVal,
      currency: 'EUR',
      notes,
      status: 'sent' as const,
      lines,
      seller_snapshot: sellerSnap,
      buyer_snapshot: buyerSnap,
      payment_iban: workspace?.iban ?? null,
      payment_bic: workspace?.bic ?? null,
      order_reference: orderReference || null,
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
    const update = { invoice_number: editingInvoice.invoice_number, due_date: editingInvoice.due_date, notes: editingInvoice.notes, order_reference: editingInvoice.order_reference }
    await supabase.from('invoices').update(update).eq('id', editingInvoice.id)
    setSavedInvoices(prev => prev.map(inv => inv.id === editingInvoice.id ? { ...inv, ...update } : inv))
    setEditingInvoice(null)
  }

  async function downloadPDF(inv: SavedInvoice) {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const ml = 20, mr = 190
    const s = inv.seller_snapshot
    const b = inv.buyer_snapshot
    const vatPct = inv.vat_rate ?? 0
    const vatAmt = inv.vat_amount ?? 0
    const total  = inv.total ?? inv.subtotal

    // ── Header ─────────────────────────────────────────────────
    doc.setFontSize(26).setFont('helvetica', 'bold').text('RECHNUNG', ml, 26)
    doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(150).text(`Nr. ${inv.invoice_number}`, ml, 33)

    // Seller (top right)
    const sLines = sellerBlock(s, null, null)
    let srY = 20
    doc.setTextColor(30)
    sLines.forEach((l, i) => {
      if (i === 0) {
        doc.setFontSize(10).setFont('helvetica', 'bold').text(l, mr, srY, { align: 'right' })
      } else {
        doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(i >= sLines.length - 2 ? 120 : 60).text(l, mr, srY, { align: 'right' })
      }
      srY += 5
    })

    doc.setDrawColor(220).setLineWidth(0.4).line(ml, 40, mr, 40)

    // Bill to
    let y = 50
    doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text('RECHNUNGSEMPFÄNGER', ml, y); y += 5
    const bLines = buyerBlock(b)
    bLines.forEach((l, i) => {
      if (i === 0) { doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(30).text(l, ml, y) }
      else { doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(80).text(l, ml, y) }
      y += 4.5
    })

    // Right-side meta
    const labelX = 130, valX = mr
    const row = (label: string, val: string, ry: number) => {
      doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text(label, labelX, ry)
      doc.setFontSize(8).setTextColor(30).setFont('helvetica', 'normal').text(val, valX, ry, { align: 'right' })
    }
    row('RECHNUNGSDATUM', format(new Date(inv.issue_date), 'dd.MM.yyyy'), 50)
    row('FÄLLIGKEITSDATUM', format(new Date(inv.due_date), 'dd.MM.yyyy'), 56)
    row('LEISTUNGSZEITRAUM', `${format(new Date(inv.period_from), 'dd.MM.')} – ${format(new Date(inv.period_to), 'dd.MM.yyyy')}`, 62)
    if (inv.order_reference) row('BESTELLREFERENZ', inv.order_reference, 68)

    // Line items table
    y = Math.max(y + 6, 80)
    doc.setFillColor(245, 246, 248).rect(ml, y - 5, mr - ml, 8, 'F')
    doc.setFontSize(7).setTextColor(100).setFont('helvetica', 'bold')
    doc.text('BESCHREIBUNG', ml + 2, y)
    doc.text('STUNDEN', 120, y, { align: 'right' })
    doc.text('PREIS/h', 143, y, { align: 'right' })
    doc.text('NETTO', 163, y, { align: 'right' })
    doc.text('BETRAG', mr, y, { align: 'right' })
    y += 5; doc.setDrawColor(210).setLineWidth(0.3)

    for (const line of inv.lines) {
      doc.line(ml, y, mr, y); y += 5
      doc.setFontSize(9).setTextColor(30).setFont('helvetica', 'normal').text(line.description, ml + 2, y)
      doc.setTextColor(90)
      doc.text(`${line.hours.toFixed(2)}h`, 120, y, { align: 'right' })
      doc.text(`€${line.rate.toFixed(2)}`, 143, y, { align: 'right' })
      doc.text(`${line.vat_rate ?? vatPct}%`, 163, y, { align: 'right' })
      doc.setTextColor(30).setFont('helvetica', 'bold').text(`€${line.amount.toFixed(2)}`, mr, y, { align: 'right' })
      doc.setFont('helvetica', 'normal'); y += 7
    }

    // Totals
    y += 4; doc.line(ml, y, mr, y); y += 6
    doc.setFontSize(8).setTextColor(100)
    doc.text('Nettobetrag', 145, y)
    doc.setTextColor(30).text(`€${inv.subtotal.toFixed(2)}`, mr, y, { align: 'right' }); y += 6
    doc.setTextColor(100).text(`USt. ${vatPct}%`, 145, y)
    doc.setTextColor(30).text(`€${vatAmt.toFixed(2)}`, mr, y, { align: 'right' }); y += 2
    doc.setDrawColor(30).setLineWidth(0.6).line(130, y, mr, y); y += 6
    doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(30)
    doc.text('Gesamtbetrag', 145, y).text(`€${total.toFixed(2)}`, mr, y, { align: 'right' })

    // Payment details
    const iban = inv.payment_iban || s?.iban
    const bic  = inv.payment_bic  || s?.bic
    if (iban) {
      y += 14; doc.setDrawColor(220).setLineWidth(0.3).line(ml, y, mr, y); y += 7
      doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text('ZAHLUNGSINFORMATIONEN', ml, y); y += 5
      doc.setFontSize(8).setTextColor(60).setFont('helvetica', 'normal')
      doc.text(`IBAN: ${iban}`, ml, y)
      if (bic) doc.text(`BIC: ${bic}`, ml + 90, y)
      y += 5
      doc.text(`Empfänger: ${s?.legal_name || ''}`, ml, y)
    }

    // Reverse charge note
    if (vatPct === 0 && inv.notes?.length) {
      y += 10; doc.setFontSize(7).setTextColor(100).text(inv.notes, ml, y, { maxWidth: mr - ml })
    } else if (inv.notes) {
      y += 10; doc.setDrawColor(220).setLineWidth(0.3).line(ml, y, mr, y); y += 7
      doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text('ANMERKUNGEN', ml, y); y += 5
      doc.setFontSize(8).setTextColor(80).setFont('helvetica', 'normal').text(doc.splitTextToSize(inv.notes, mr - ml), ml, y)
    }

    doc.setFontSize(7).setTextColor(180).setFont('helvetica', 'normal').text('Erstellt mit Kairos · EN 16931 konform', 105, 287, { align: 'center' })
    doc.save(`${inv.invoice_number}.pdf`)
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const vatAmount = Math.round(subtotal * selectedVat.value / 100 * 100) / 100
  const total = subtotal + vatAmount
  const selectedClient = clients.find(c => c.id === clientId)

  if (!can(role, 'manage:invoices')) return null

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

              {/* VAT rate — EN 16931 requirement */}
              <div>
                <label className="label">Steuersatz (USt.)</label>
                <select className="input" value={vatRateIdx} onChange={e => { setVatRateIdx(Number(e.target.value)); setGenerated(false) }}>
                  {VAT_OPTIONS.map((v, i) => <option key={i} value={i}>{v.label}</option>)}
                </select>
              </div>

              {/* Order reference — ebInterface 6.1 */}
              <div>
                <label className="label">Bestellreferenz <span className="text-muted-foreground/50">(ebInterface)</span></label>
                <input className="input" placeholder="Auftragsnummer, PO-Nr. …" value={orderReference} onChange={e => setOrderReference(e.target.value)} />
              </div>

              <div className="col-span-2 md:col-span-3">
                <label className="label">{t('notesPayment')}</label>
                <textarea className="input resize-none" rows={2} placeholder="Zahlungshinweise, Anmerkungen …" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            {/* Missing legal info warning */}
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
                <button
                  onClick={generate}
                  disabled={loading || !clientId || totalApproved === 0 || summaryLoading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40"
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
                        { id: '', invoice_number: invoiceNumber, client_name: selectedClient?.name || '', client_id: clientId, issue_date: issueDate, due_date: dueDate, period_from: fromDate, period_to: toDate, subtotal, vat_rate: selectedVat.value, vat_amount: vatAmount, total, notes, status: currentStatus, lines, seller_snapshot: workspace, buyer_snapshot: selectedClient ?? null, payment_iban: workspace?.iban ?? null, payment_bic: workspace?.bic ?? null, order_reference: orderReference || null, sent_at: null, paid_at: null, created_at: new Date().toISOString() },
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

          {/* Invoice preview — EN 16931 layout */}
          {generated && (
            <div className="card p-10 bg-white dark:bg-[hsl(217.2,32.6%,10%)]" id="invoice-preview">
              {/* Header */}
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
                  <div className="mt-2">{statusBadge(currentStatus, t)}</div>
                </div>
              </div>

              {/* Parties + dates */}
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

              {/* Line items */}
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

              {/* Totals */}
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

              {/* Payment info */}
              {(workspace?.iban) && (
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
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-foreground text-sm">{inv.invoice_number}</span>
                    {statusBadge(inv.status, t)}
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
                    <button onClick={() => exportEBInterface(inv)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1" title="ebInterface 6.1 XML exportieren">
                      <Code2 className="w-3 h-3" /> ebi
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
