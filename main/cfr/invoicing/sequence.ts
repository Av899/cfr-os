/**
 * CFR OS: Indian Financial Year Gap-Free Invoicing & Credit Note Engine
 *
 * Compliance:
 * - Indian Financial Year runs from April 1st 00:00:00 IST to March 31st 23:59:59 IST.
 * - Format: CFR/YY-YY/000123 (e.g. CFR/26-27/000001)
 * - Credit Note Format: CN/YY-YY/000123 (e.g. CN/26-27/000001)
 * - Gap-Free: Sequence numbers are allocated strictly inside an immediate database transaction lock.
 * - Immutability: Once issued, an invoice is never updated or deleted. Voids generate an official Credit Note.
 */

import type Database from 'better-sqlite3';
import { calculateHaryanaGst, GstBreakdown } from '../money/gst-engine';

export interface CfrInvoiceRecord {
  id: string;
  invoice_number: string;
  order_id: string;
  fy: string;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  roundoff_paise: number;
  payable_paise: number;
  payment_method: 'UPI_DYNAMIC' | 'UPI_MANUAL' | 'CASH' | 'CARD';
  payment_ref?: string | null;
  status: 'ISSUED' | 'VOIDED' | 'CREDIT_NOTE_ISSUED';
  created_at: string;
}

export interface CfrCreditNoteRecord {
  id: string;
  credit_note_number: string;
  original_invoice_id: string;
  original_invoice_number: string;
  reason: string;
  amount_paise: number;
  created_at: string;
}

/**
 * Computes the Indian Financial Year string (e.g. '26-27') in IST for a given date.
 */
export function getFinancialYear(date: Date = new Date()): string {
  // IST is UTC + 5:30 (330 minutes)
  const utc = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  const istDate = new Date(utc + 5.5 * 60 * 60 * 1000);

  const year = istDate.getFullYear();
  const month = istDate.getMonth(); // 0 = Jan, 1 = Feb, 2 = Mar, 3 = Apr

  let startYear = year;
  if (month < 3) {
    // Jan, Feb, Mar belong to previous FY
    startYear = year - 1;
  }
  const endYear = startYear + 1;

  const yyStart = String(startYear).slice(-2);
  const yyEnd = String(endYear).slice(-2);
  return `${yyStart}-${yyEnd}`;
}

/**
 * Issues an official gap-free Indian GST invoice for a completed order.
 * Strictly executes inside a SQLite transaction lock to prevent duplicate or skipped numbers.
 */
export function issueCfrInvoice(
  db: Database.Database,
  params: {
    order_id: string;
    taxable_paise: number;
    payment_method: 'UPI_DYNAMIC' | 'UPI_MANUAL' | 'CASH' | 'CARD';
    payment_ref?: string | null;
    custom_date?: Date;
  }
): { invoice: CfrInvoiceRecord; gst: GstBreakdown } {
  const targetDate = params.custom_date || new Date();
  const fy = getFinancialYear(targetDate);
  const gst = calculateHaryanaGst(params.taxable_paise);

  const metaKey = `seq_invoice_fy_${fy}`;
  const nowIso = targetDate.toISOString();

  let createdInvoice: CfrInvoiceRecord | null = null;

  // Transaction lock guarantees gap-free sequential numbers without race conditions
  db.transaction(() => {
    // 1. Fetch current counter
    const row = db
      .prepare('SELECT value FROM cfr_meta WHERE key = ?')
      .get(metaKey) as { value: string } | undefined;

    const currentVal = row ? parseInt(row.value, 10) : 0;
    const nextVal = currentVal + 1;

    // 2. Increment sequence in cfr_meta
    db.prepare(`
      INSERT INTO cfr_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(metaKey, String(nextVal), nowIso);

    // 3. Compose gap-free invoice number: CFR/26-27/000001
    const padded = String(nextVal).padStart(6, '0');
    const invoiceNumber = `CFR/${fy}/${padded}`;
    const invoiceId = `inv_${fy}_${padded}`;

    // 4. Insert into cfr_invoices
    db.prepare(`
      INSERT INTO cfr_invoices (
        id, invoice_number, order_id, fy,
        taxable_paise, cgst_paise, sgst_paise, roundoff_paise, payable_paise,
        payment_method, payment_ref, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?)
    `).run(
      invoiceId,
      invoiceNumber,
      params.order_id,
      fy,
      gst.taxable_paise,
      gst.cgst_paise,
      gst.sgst_paise,
      gst.round_off_paise,
      gst.payable_paise,
      params.payment_method,
      params.payment_ref || null,
      nowIso
    );

    createdInvoice = {
      id: invoiceId,
      invoice_number: invoiceNumber,
      order_id: params.order_id,
      fy,
      taxable_paise: gst.taxable_paise,
      cgst_paise: gst.cgst_paise,
      sgst_paise: gst.sgst_paise,
      roundoff_paise: gst.round_off_paise,
      payable_paise: gst.payable_paise,
      payment_method: params.payment_method,
      payment_ref: params.payment_ref || null,
      status: 'ISSUED',
      created_at: nowIso,
    };
  })();

  if (!createdInvoice) {
    throw new Error('Failed to issue CFR invoice inside database transaction.');
  }

  return { invoice: createdInvoice, gst };
}

/**
 * Issues an official Credit Note for an invoice that was voided or refunded.
 * Never deletes or alters the original invoice amounts.
 */
export function issueCfrCreditNote(
  db: Database.Database,
  params: {
    invoice_id: string;
    reason: string;
    custom_date?: Date;
  }
): CfrCreditNoteRecord {
  const targetDate = params.custom_date || new Date();
  const fy = getFinancialYear(targetDate);
  const metaKey = `seq_credit_note_fy_${fy}`;
  const nowIso = targetDate.toISOString();

  let creditNote: CfrCreditNoteRecord | null = null;

  db.transaction(() => {
    // 1. Fetch original invoice
    const inv = db
      .prepare('SELECT id, invoice_number, payable_paise, status FROM cfr_invoices WHERE id = ? OR invoice_number = ?')
      .get(params.invoice_id, params.invoice_id) as
      | { id: string; invoice_number: string; payable_paise: number; status: string }
      | undefined;

    if (!inv) {
      throw new Error(`Invoice "${params.invoice_id}" not found.`);
    }

    if (inv.status === 'CREDIT_NOTE_ISSUED') {
      throw new Error(`Invoice "${inv.invoice_number}" has already been voided via a credit note.`);
    }

    // 2. Fetch and increment Credit Note sequence
    const seqRow = db
      .prepare('SELECT value FROM cfr_meta WHERE key = ?')
      .get(metaKey) as { value: string } | undefined;

    const currentVal = seqRow ? parseInt(seqRow.value, 10) : 0;
    const nextVal = currentVal + 1;

    db.prepare(`
      INSERT INTO cfr_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(metaKey, String(nextVal), nowIso);

    const padded = String(nextVal).padStart(6, '0');
    const cnNumber = `CN/${fy}/${padded}`;
    const cnId = `cn_${fy}_${padded}`;

    // 3. Insert credit note record
    db.prepare(`
      INSERT INTO cfr_credit_notes (
        id, credit_note_number, original_invoice_id, reason, amount_paise, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(cnId, cnNumber, inv.id, params.reason, inv.payable_paise, nowIso);

    // 4. Mark invoice status as CREDIT_NOTE_ISSUED
    db.prepare('UPDATE cfr_invoices SET status = ? WHERE id = ?').run('CREDIT_NOTE_ISSUED', inv.id);

    creditNote = {
      id: cnId,
      credit_note_number: cnNumber,
      original_invoice_id: inv.id,
      original_invoice_number: inv.invoice_number,
      reason: params.reason,
      amount_paise: inv.payable_paise,
      created_at: nowIso,
    };
  })();

  if (!creditNote) {
    throw new Error('Failed to create credit note inside transaction.');
  }

  return creditNote;
}
