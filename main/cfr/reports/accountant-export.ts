/**
 * CFR OS: Chartered Accountant Indian GST Export Engine (GSTR-1 Format)
 * Formats daily or monthly sequential invoices and credit notes into a
 * clean, audit-ready CSV for Indian GST filing in Haryana.
 */

import type Database from 'better-sqlite3';

export interface GstExportRow {
  invoice_number: string;
  invoice_date: string;
  customer_gstin: string;
  place_of_supply: string;
  reverse_charge: string;
  applicable_tax_rate: string;
  invoice_type: string;
  rate: string;
  taxable_value: string;
  cgst_amount: string;
  sgst_amount: string;
  cess_amount: string;
  round_off: string;
  invoice_total: string;
  payment_method: string;
  payment_ref: string;
  status: string;
}

/**
 * Generates an array of structured GSTR-1 compliant rows.
 */
export function generateGstExportRows(
  db: Database.Database,
  startDate?: string, // YYYY-MM-DD
  endDate?: string,   // YYYY-MM-DD
): GstExportRow[] {
  let invoiceQuery = `
    SELECT i.*, p.method as payment_method_resolved, p.utr_ref
    FROM cfr_invoices i
    LEFT JOIN cfr_payments p ON i.id = p.invoice_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (startDate) {
    invoiceQuery += ` AND (
      i.created_at >= ? OR
      COALESCE(DATE(i.created_at, '+330 minutes'), SUBSTR(i.created_at, 1, 10)) >= ?
    )`;
    params.push(`${startDate}T00:00:00.000Z`, startDate);
  }
  if (endDate) {
    invoiceQuery += ` AND (
      i.created_at <= ? OR
      COALESCE(DATE(i.created_at, '+330 minutes'), SUBSTR(i.created_at, 1, 10)) <= ?
    )`;
    params.push(`${endDate}T23:59:59.999Z`, endDate);
  }

  invoiceQuery += ' ORDER BY i.invoice_number ASC';

  const invoices = db.prepare(invoiceQuery).all(...params) as Array<Record<string, any>>;
  const rows: GstExportRow[] = [];

  for (const inv of invoices) {
    const invDate = new Date(inv.created_at);
    const day = String(invDate.getDate()).padStart(2, '0');
    const month = String(invDate.getMonth() + 1).padStart(2, '0');
    const year = invDate.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    const taxable = (Number(inv.taxable_paise ?? inv.subtotal_paise ?? 0) / 100).toFixed(2);
    const cgst = (Number(inv.cgst_paise || 0) / 100).toFixed(2);
    const sgst = (Number(inv.sgst_paise || 0) / 100).toFixed(2);
    const roundoff = (Number(inv.roundoff_paise || 0) / 100).toFixed(2);
    const total = (Number(inv.payable_paise ?? inv.total_paise ?? 0) / 100).toFixed(2);

    rows.push({
      invoice_number: inv.invoice_number,
      invoice_date: formattedDate,
      customer_gstin: 'URP', // Unregistered Person / Consumer
      place_of_supply: '06-Haryana',
      reverse_charge: 'N',
      applicable_tax_rate: '5.0%',
      invoice_type: 'Regular',
      rate: '5.00%',
      taxable_value: taxable,
      cgst_amount: cgst,
      sgst_amount: sgst,
      cess_amount: '0.00',
      round_off: roundoff,
      invoice_total: total,
      payment_method: inv.payment_method_resolved || inv.payment_method || inv.payment_mode || 'UPI',
      payment_ref: inv.utr_ref || inv.payment_ref || '',
      status: inv.status,
    });
  }

  // Also append Credit Notes if any exist in the range
  let creditNoteQuery = `
    SELECT cn.*, i.invoice_number as original_inv_num
    FROM cfr_credit_notes cn
    JOIN cfr_invoices i ON cn.original_invoice_id = i.id
    WHERE 1=1
  `;
  const cnParams: unknown[] = [];
  if (startDate) {
    creditNoteQuery += ` AND (
      cn.created_at >= ? OR
      COALESCE(DATE(cn.created_at, '+330 minutes'), SUBSTR(cn.created_at, 1, 10)) >= ?
    )`;
    cnParams.push(`${startDate}T00:00:00.000Z`, startDate);
  }
  if (endDate) {
    creditNoteQuery += ` AND (
      cn.created_at <= ? OR
      COALESCE(DATE(cn.created_at, '+330 minutes'), SUBSTR(cn.created_at, 1, 10)) <= ?
    )`;
    cnParams.push(`${endDate}T23:59:59.999Z`, endDate);
  }

  const creditNotes = db.prepare(creditNoteQuery).all(...cnParams) as Array<Record<string, any>>;

  for (const cn of creditNotes) {
    const cnDate = new Date(cn.created_at);
    const day = String(cnDate.getDate()).padStart(2, '0');
    const month = String(cnDate.getMonth() + 1).padStart(2, '0');
    const year = cnDate.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    const totalPaise = Number(cn.amount_paise || 0);
    const taxablePaise = Math.round(totalPaise / 1.05);
    const cgstPaise = Math.round(taxablePaise * 0.025);
    const sgstPaise = Math.round(taxablePaise * 0.025);
    const roundoffPaise = totalPaise - (taxablePaise + cgstPaise + sgstPaise);

    rows.push({
      invoice_number: cn.credit_note_number,
      invoice_date: formattedDate,
      customer_gstin: 'URP',
      place_of_supply: '06-Haryana',
      reverse_charge: 'N',
      applicable_tax_rate: '5.0%',
      invoice_type: 'Credit Note',
      rate: '5.00%',
      taxable_value: `-${(taxablePaise / 100).toFixed(2)}`,
      cgst_amount: `-${(cgstPaise / 100).toFixed(2)}`,
      sgst_amount: `-${(sgstPaise / 100).toFixed(2)}`,
      cess_amount: '0.00',
      round_off: `${(roundoffPaise / 100).toFixed(2)}`,
      invoice_total: `-${(totalPaise / 100).toFixed(2)}`,
      payment_method: 'REVERSAL',
      payment_ref: `Ref: ${cn.original_inv_num}`,
      status: 'CREDIT_NOTE_ISSUED',
    });
  }

  return rows;
}

/**
 * Converts structured export rows into a clean RFC-4180 CSV string.
 */
export function generateGstCsvString(rows: GstExportRow[]): string {
  const headers = [
    'Invoice Number',
    'Invoice Date',
    'Customer GSTIN',
    'Place of Supply',
    'Reverse Charge',
    'Applicable % of Tax Rate',
    'Invoice Type',
    'Rate',
    'Taxable Value (INR)',
    'Central Tax / CGST (INR)',
    'State Tax / SGST (INR)',
    'Cess Amount (INR)',
    'Round Off (INR)',
    'Invoice Total (INR)',
    'Payment Method',
    'Payment Ref / UTR',
    'Status',
  ];

  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvLines: string[] = [headers.join(',')];

  for (const r of rows) {
    const line = [
      escapeCsv(r.invoice_number),
      escapeCsv(r.invoice_date),
      escapeCsv(r.customer_gstin),
      escapeCsv(r.place_of_supply),
      escapeCsv(r.reverse_charge),
      escapeCsv(r.applicable_tax_rate),
      escapeCsv(r.invoice_type),
      escapeCsv(r.rate),
      escapeCsv(r.taxable_value),
      escapeCsv(r.cgst_amount),
      escapeCsv(r.sgst_amount),
      escapeCsv(r.cess_amount),
      escapeCsv(r.round_off),
      escapeCsv(r.invoice_total),
      escapeCsv(r.payment_method),
      escapeCsv(r.payment_ref),
      escapeCsv(r.status),
    ].join(',');
    csvLines.push(line);
  }

  return csvLines.join('\n');
}
