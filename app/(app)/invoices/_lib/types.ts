import { type Client } from '@/lib/types'

export type InvoiceLine = {
  description: string
  hours: number
  rate: number
  amount: number
  vat_rate: number
  vat_amount: number
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid'

export type WorkspaceLegal = {
  legal_name: string | null
  address_street: string | null
  address_city: string | null
  address_zip: string | null
  address_country: string | null
  vat_id: string | null
  iban: string | null
  bic: string | null
}

export type HoursSummary = {
  projectId: string
  projectName: string
  color: string
  approvedHours: number
  pendingHours: number
  draftHours: number
  approvedRevenue: number
  rate: number
}

export type SavedInvoice = {
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

export const VAT_OPTIONS = [
  { label: '20% — Standard (Inland)',               value: 20,  taxCode: 'U20' },
  { label: '10% — Ermäßigt',                        value: 10,  taxCode: 'U10' },
  { label: '0% — EU-Leistung (§ 3a UStG)',          value: 0,   taxCode: 'IG'  },
  { label: '0% — Reverse Charge (§ 19 UStG)',       value: 0,   taxCode: 'RC'  },
  { label: '0% — Export / Ausfuhrlieferung',        value: 0,   taxCode: 'AU'  },
]
