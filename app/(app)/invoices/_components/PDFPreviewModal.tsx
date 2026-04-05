'use client'

import { useEffect, useCallback } from 'react'
import { X, Download, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { type SavedInvoice } from '../_lib/types'
import { downloadPDF, sellerBlock, buyerBlock } from '../_lib/export'

export function PDFPreviewModal({ invoice, onClose }: {
  invoice: SavedInvoice
  onClose: () => void
}) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  const s       = invoice.seller_snapshot
  const b       = invoice.buyer_snapshot
  const vatPct  = invoice.vat_rate ?? 0
  const vatAmt  = invoice.vat_amount ?? 0
  const total   = invoice.total ?? invoice.subtotal
  const iban    = invoice.payment_iban || s?.iban
  const bic     = invoice.payment_bic  || s?.bic

  const sLines = sellerBlock(s, null, null)
  const bLines = buyerBlock(b)

  const fmt = (d: string) => format(new Date(d), 'dd.MM.yyyy')
  // Manual German format: period thousands separator, comma decimal — guaranteed across all browsers
  const fmtDE = (n: number, decimals = 2) => {
    const [int, dec] = n.toFixed(decimals).split('.')
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec
  }
  const money  = (n: number) => `€\u202F${fmtDE(n)}`
  const fmtNum = (n: number, decimals = 2) => fmtDE(n, decimals)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">{invoice.invoice_number}</p>
            <p className="text-xs text-muted-foreground truncate">{invoice.client_name}</p>
          </div>
        </div>
        <button
          onClick={() => downloadPDF(invoice)}
          className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3 shrink-0"
        >
          <Download className="w-3.5 h-3.5" /> Download
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable preview area */}
      <div className="flex-1 overflow-y-auto bg-zinc-200 dark:bg-zinc-800 py-8 px-4 flex justify-center">
        {/* A4 paper */}
        <div className="bg-white text-zinc-900 w-full max-w-[794px] min-h-[1123px] shadow-2xl rounded-sm p-[52px] font-sans text-[13px] leading-snug flex flex-col">

          {/* Header row */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-[26px] font-bold tracking-tight text-zinc-900">RECHNUNG</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Nr. {invoice.invoice_number}</p>
            </div>
            <div className="text-right">
              {sLines.map((l, i) => (
                <p key={i} className={i === 0 ? 'font-semibold text-[13px]' : 'text-[11px] text-zinc-500'}>{l}</p>
              ))}
            </div>
          </div>

          <hr className="border-zinc-200 mb-6" />

          {/* Buyer + meta */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Rechnungsempfänger</p>
              {bLines.map((l, i) => (
                <p key={i} className={i === 0 ? 'font-semibold text-[13px]' : 'text-[11px] text-zinc-500'}>{l}</p>
              ))}
            </div>
            <div className="text-right space-y-1">
              {[
                ['Rechnungsdatum',   fmt(invoice.issue_date)],
                ['Fälligkeitsdatum', fmt(invoice.due_date)],
                ['Leistungszeitraum', `${fmt(invoice.period_from)} – ${fmt(invoice.period_to)}`],
                ...(invoice.order_reference ? [['Bestellreferenz', invoice.order_reference]] : []),
              ].map(([label, val]) => (
                <div key={label} className="flex items-baseline gap-4 justify-end">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
                  <span className="text-[12px] text-zinc-700 w-36 text-right">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Line items table */}
          <table className="w-full border-collapse mb-6">
            <thead>
              <tr className="bg-zinc-50">
                <th className="text-left text-[9px] font-bold text-zinc-400 uppercase tracking-widest py-2 px-2">Beschreibung</th>
                <th className="text-right text-[9px] font-bold text-zinc-400 uppercase tracking-widest py-2 px-2">Stunden</th>
                <th className="text-right text-[9px] font-bold text-zinc-400 uppercase tracking-widest py-2 px-2">Preis/h</th>
                <th className="text-right text-[9px] font-bold text-zinc-400 uppercase tracking-widest py-2 px-2">MwSt.</th>
                <th className="text-right text-[9px] font-bold text-zinc-400 uppercase tracking-widest py-2 px-2">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={i} className="border-t border-zinc-100">
                  <td className="py-3 px-2 text-[13px] text-zinc-800">{line.description}</td>
                  <td className="py-3 px-2 text-right text-[12px] text-zinc-500 tabular-nums">{fmtNum(line.hours)}h</td>
                  <td className="py-3 px-2 text-right text-[12px] text-zinc-500 tabular-nums">€{fmtNum(line.rate)}</td>
                  <td className="py-3 px-2 text-right text-[12px] text-zinc-500 tabular-nums">{line.vat_rate ?? vatPct}%</td>
                  <td className="py-3 px-2 text-right text-[13px] font-semibold text-zinc-800 tabular-nums">{money(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64 space-y-1.5">
              <div className="flex justify-between text-[12px] text-zinc-500">
                <span>Nettobetrag</span><span className="tabular-nums">{money(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[12px] text-zinc-500">
                <span>USt. {vatPct}%</span><span className="tabular-nums">{money(vatAmt)}</span>
              </div>
              <hr className="border-zinc-300 my-1" />
              <div className="flex justify-between text-[15px] font-bold text-zinc-900">
                <span>Gesamtbetrag</span><span className="tabular-nums">{money(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="border-t border-zinc-200 pt-5 mt-5">
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Anmerkungen</p>
              <p className="text-[12px] text-zinc-600 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Spacer — pushes payment info to bottom */}
          <div className="flex-1" />

          {/* Payment info — always at bottom */}
          {iban && (
            <div className="border-t border-zinc-200 pt-5 mt-8 space-y-0.5">
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Zahlungsinformationen</p>
              <p className="text-[12px] text-zinc-600">IBAN: {iban}{bic ? `  ·  BIC: ${bic}` : ''}</p>
              {s?.legal_name && <p className="text-[12px] text-zinc-600">Empfänger: {s.legal_name}</p>}
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-[9px] text-zinc-300 mt-6">
            Erstellt mit Kairos · EN 16931 konform
          </p>
        </div>
      </div>
    </div>
  )
}
