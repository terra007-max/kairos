'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Download, Loader2, FileText } from 'lucide-react'
import { type SavedInvoice } from '../_lib/types'
import { generatePDFBlobUrl, downloadPDF } from '../_lib/export'

export function PDFPreviewModal({ invoice, onClose }: {
  invoice: SavedInvoice
  onClose: () => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let url: string
    generatePDFBlobUrl(invoice).then(u => {
      url = u
      setBlobUrl(u)
      setLoading(false)
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [invoice])

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

      {/* PDF frame */}
      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {blobUrl && (
          <iframe
            src={blobUrl}
            className="w-full h-full border-0"
            title={invoice.invoice_number}
          />
        )}
      </div>
    </div>
  )
}
