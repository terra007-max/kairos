import { format } from 'date-fns'
import { type Client } from '@/lib/types'
import { type SavedInvoice, type WorkspaceLegal, VAT_OPTIONS } from './types'

export function sellerBlock(ws: WorkspaceLegal | null, name: string | null, email: string | null): string[] {
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

export function buyerBlock(client: Partial<Client> | null): string[] {
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

export function exportBMDNTCS(invoice: SavedInvoice, taxCode: string, revenueAccount: string, debitorAccount: string) {
  const fmt = (d: string) => format(new Date(d), 'dd.MM.yyyy')
  const amt = (n: number) => n.toFixed(2).replace('.', ',')
  const tc = taxCode || 'U20'
  const header = 'Buchungskreis;Datum;Belegnummer;Buchungstext;Betrag;Steuercode;Debitorenkonto;Erlöskonto'
  const rows = invoice.lines.map(line =>
    ['1', fmt(invoice.issue_date), invoice.invoice_number,
      `"${invoice.client_name} - ${line.description}"`,
      amt(line.amount), tc, debitorAccount || '10000', revenueAccount || '4000',
    ].join(';')
  )
  const blob = new Blob(['\uFEFF' + [header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `BMD_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportEBInterface(invoice: SavedInvoice) {
  const s = invoice.seller_snapshot
  const b = invoice.buyer_snapshot
  const vatOpt = VAT_OPTIONS.find(v => v.value === invoice.vat_rate) || VAT_OPTIONS[0]
  const isReverseCharge = vatOpt.taxCode === 'RC'
  const esc = (v: string | null | undefined) =>
    (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const sellerLines = [
    s?.legal_name ? `      <Name>${esc(s.legal_name)}</Name>` : '',
    `      <Address>`,
    s?.address_street ? `        <Street>${esc(s.address_street)}</Street>` : '',
    s?.address_city   ? `        <Town>${esc(s.address_city)}</Town>` : '',
    s?.address_zip    ? `        <ZIP>${esc(s.address_zip)}</ZIP>` : '',
    `        <Country CountryCode="${esc(s?.address_country || 'AT')}">${esc(s?.address_country || 'AT')}</Country>`,
    `      </Address>`,
  ].filter(Boolean).join('\n')

  const buyerLines = [
    b?.name ? `    <Name>${esc(b.name)}</Name>` : '',
    `    <Address>`,
    b?.address_street ? `      <Street>${esc(b.address_street)}</Street>` : '',
    b?.address_city   ? `      <Town>${esc(b.address_city)}</Town>` : '',
    b?.address_zip    ? `      <ZIP>${esc(b.address_zip)}</ZIP>` : '',
    `      <Country CountryCode="${esc(b?.address_country || 'AT')}">${esc(b?.address_country || 'AT')}</Country>`,
    b?.email ? `    <Contact><Phone/><Email>${esc(b.email)}</Email></Contact>` : '',
  ].filter(Boolean).join('\n')

  const lineItems = invoice.lines.map((l, i) => `    <ListLineItem>
      <PositionNumber>${i + 1}</PositionNumber>
      <Description>${esc(l.description)}</Description>
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

  <InvoiceNumber>${esc(invoice.invoice_number)}</InvoiceNumber>
  <InvoiceDate>${invoice.issue_date}</InvoiceDate>

  <DeliveryDate>
    <FromDate>${invoice.period_from}</FromDate>
    <ToDate>${invoice.period_to}</ToDate>
  </DeliveryDate>

  <Biller>
    ${s?.vat_id ? `<VATIdentificationNumber>${esc(s.vat_id)}</VATIdentificationNumber>` : ''}
    <InvoicingParty>
${sellerLines}
    </InvoicingParty>
  </Biller>

  <InvoiceRecipient>
    ${b?.vat_id ? `<VATIdentificationNumber>${esc(b.vat_id)}</VATIdentificationNumber>` : ''}
${buyerLines}
  </InvoiceRecipient>

  ${invoice.order_reference ? `<OrderReference>\n    <OrderID>${esc(invoice.order_reference)}</OrderID>\n  </OrderReference>` : ''}

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
          <IBAN>${esc(invoice.payment_iban || s?.iban || '')}</IBAN>
          ${(invoice.payment_bic || s?.bic) ? `<BIC>${esc(invoice.payment_bic || s?.bic || '')}</BIC>` : ''}
          <BankAccountOwner>${esc(s?.legal_name || '')}</BankAccountOwner>
        </BeneficiaryAccount>
      </UniversalBankTransaction>
    </PaymentMethods>` : ''}
  </PaymentConditions>

</Invoice>`

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ebInterface_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}.xml`
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadPDF(inv: SavedInvoice) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const ml = 20, mr = 190
  const s = inv.seller_snapshot
  const b = inv.buyer_snapshot
  const vatPct = inv.vat_rate ?? 0
  const vatAmt = inv.vat_amount ?? 0
  const total  = inv.total ?? inv.subtotal

  doc.setFontSize(26).setFont('helvetica', 'bold').text('RECHNUNG', ml, 26)
  doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(150).text(`Nr. ${inv.invoice_number}`, ml, 33)

  const sLines = sellerBlock(s, null, null)
  let srY = 20
  doc.setTextColor(30)
  sLines.forEach((l, i) => {
    if (i === 0) { doc.setFontSize(10).setFont('helvetica', 'bold').text(l, mr, srY, { align: 'right' }) }
    else { doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(i >= sLines.length - 2 ? 120 : 60).text(l, mr, srY, { align: 'right' }) }
    srY += 5
  })

  doc.setDrawColor(220).setLineWidth(0.4).line(ml, 40, mr, 40)

  let y = 50
  doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text('RECHNUNGSEMPFÄNGER', ml, y); y += 5
  const bLines = buyerBlock(b)
  bLines.forEach((l, i) => {
    if (i === 0) { doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(30).text(l, ml, y) }
    else { doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(80).text(l, ml, y) }
    y += 4.5
  })

  const labelX = 130, valX = mr
  const row = (label: string, val: string, ry: number) => {
    doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text(label, labelX, ry)
    doc.setFontSize(8).setTextColor(30).setFont('helvetica', 'normal').text(val, valX, ry, { align: 'right' })
  }
  row('RECHNUNGSDATUM',   format(new Date(inv.issue_date), 'dd.MM.yyyy'), 50)
  row('FÄLLIGKEITSDATUM', format(new Date(inv.due_date),   'dd.MM.yyyy'), 56)
  row('LEISTUNGSZEITRAUM', `${format(new Date(inv.period_from), 'dd.MM.')} – ${format(new Date(inv.period_to), 'dd.MM.yyyy')}`, 62)
  if (inv.order_reference) row('BESTELLREFERENZ', inv.order_reference, 68)

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

  y += 4; doc.line(ml, y, mr, y); y += 6
  doc.setFontSize(8).setTextColor(100)
  doc.text('Nettobetrag', 145, y)
  doc.setTextColor(30).text(`€${inv.subtotal.toFixed(2)}`, mr, y, { align: 'right' }); y += 6
  doc.setTextColor(100).text(`USt. ${vatPct}%`, 145, y)
  doc.setTextColor(30).text(`€${vatAmt.toFixed(2)}`, mr, y, { align: 'right' }); y += 2
  doc.setDrawColor(30).setLineWidth(0.6).line(130, y, mr, y); y += 6
  doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(30)
  doc.text('Gesamtbetrag', 145, y).text(`€${total.toFixed(2)}`, mr, y, { align: 'right' })

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

export async function generatePDFBlobUrl(inv: SavedInvoice): Promise<string> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const ml = 20, mr = 190
  const s = inv.seller_snapshot
  const b = inv.buyer_snapshot
  const vatPct = inv.vat_rate ?? 0
  const vatAmt = inv.vat_amount ?? 0
  const total  = inv.total ?? inv.subtotal

  doc.setFontSize(26).setFont('helvetica', 'bold').text('RECHNUNG', ml, 26)
  doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(150).text(`Nr. ${inv.invoice_number}`, ml, 33)

  const sLines = sellerBlock(s, null, null)
  let srY = 20
  doc.setTextColor(30)
  sLines.forEach((l, i) => {
    if (i === 0) { doc.setFontSize(10).setFont('helvetica', 'bold').text(l, mr, srY, { align: 'right' }) }
    else { doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(i >= sLines.length - 2 ? 120 : 60).text(l, mr, srY, { align: 'right' }) }
    srY += 5
  })

  doc.setDrawColor(220).setLineWidth(0.4).line(ml, 40, mr, 40)

  let y = 50
  doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text('RECHNUNGSEMPFÄNGER', ml, y); y += 5
  const bLines = buyerBlock(b)
  bLines.forEach((l, i) => {
    if (i === 0) { doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(30).text(l, ml, y) }
    else { doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(80).text(l, ml, y) }
    y += 4.5
  })

  const labelX = 130, valX = mr
  const row = (label: string, val: string, ry: number) => {
    doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text(label, labelX, ry)
    doc.setFontSize(8).setTextColor(30).setFont('helvetica', 'normal').text(val, valX, ry, { align: 'right' })
  }
  row('RECHNUNGSDATUM',   format(new Date(inv.issue_date), 'dd.MM.yyyy'), 50)
  row('FÄLLIGKEITSDATUM', format(new Date(inv.due_date),   'dd.MM.yyyy'), 56)
  row('LEISTUNGSZEITRAUM', `${format(new Date(inv.period_from), 'dd.MM.')} – ${format(new Date(inv.period_to), 'dd.MM.yyyy')}`, 62)
  if (inv.order_reference) row('BESTELLREFERENZ', inv.order_reference, 68)

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

  y += 4; doc.line(ml, y, mr, y); y += 6
  doc.setFontSize(8).setTextColor(100)
  doc.text('Nettobetrag', 145, y)
  doc.setTextColor(30).text(`€${inv.subtotal.toFixed(2)}`, mr, y, { align: 'right' }); y += 6
  doc.setTextColor(100).text(`USt. ${vatPct}%`, 145, y)
  doc.setTextColor(30).text(`€${vatAmt.toFixed(2)}`, mr, y, { align: 'right' }); y += 2
  doc.setDrawColor(30).setLineWidth(0.6).line(130, y, mr, y); y += 6
  doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(30)
  doc.text('Gesamtbetrag', 145, y).text(`€${total.toFixed(2)}`, mr, y, { align: 'right' })

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

  if (vatPct === 0 && inv.notes?.length) {
    y += 10; doc.setFontSize(7).setTextColor(100).text(inv.notes, ml, y, { maxWidth: mr - ml })
  } else if (inv.notes) {
    y += 10; doc.setDrawColor(220).setLineWidth(0.3).line(ml, y, mr, y); y += 7
    doc.setFontSize(7).setTextColor(150).setFont('helvetica', 'bold').text('ANMERKUNGEN', ml, y); y += 5
    doc.setFontSize(8).setTextColor(80).setFont('helvetica', 'normal').text(doc.splitTextToSize(inv.notes, mr - ml), ml, y)
  }

  doc.setFontSize(7).setTextColor(180).setFont('helvetica', 'normal').text('Erstellt mit Kairos · EN 16931 konform', 105, 287, { align: 'center' })
  return doc.output('bloburl') as string
}
