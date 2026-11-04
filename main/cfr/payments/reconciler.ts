/**
 * CFR OS: Payment Reconciler & Dual-Track Manager
 *
 * Manages dual-track payments:
 * - Online Track: Automated Razorpay POS / Smart QR confirmation.
 * - Offline Track: Cashier manual UTR entry when WAN is down, tagged PENDING_RECONCILIATION
 *   so coffee service and order flow never stall.
 */

import type Database from 'better-sqlite3';
import { isValidUtr, normalizeUtr } from './upi-qr';

export interface CfrPaymentRecord {
  id: string;
  order_id: string;
  invoice_id?: string | null;
  method: 'UPI_DYNAMIC' | 'UPI_MANUAL' | 'CASH' | 'CARD';
  amount_paise: number;
  status: 'PENDING_RECONCILIATION' | 'CONFIRMED' | 'FAILED';
  upi_uri?: string | null;
  utr_ref?: string | null;
  gateway_payment_id?: string | null;
  reconciled_at?: string | null;
  created_at: string;
}

export class InvalidUtrError extends Error {
  public readonly code = 'ERR_CFR_INVALID_UTR';
  public readonly statusCode = 400;

  constructor(utr: string) {
    super(`Invalid UPI reference: "${utr}" is not a valid 12-digit Indian Bank UTR.`);
    this.name = 'InvalidUtrError';
  }
}

/**
 * Initializes a new payment attempt in SQLite.
 */
export function createPaymentRecord(
  db: Database.Database,
  params: {
    order_id: string;
    method: 'UPI_DYNAMIC' | 'UPI_MANUAL' | 'CASH' | 'CARD';
    amount_paise: number;
    upi_uri?: string;
    invoice_id?: string;
  }
): CfrPaymentRecord {
  const id = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  // Cash is instantly confirmed; UPI defaults to PENDING_RECONCILIATION until verified or manual UTR confirmed
  const initialStatus = params.method === 'CASH' ? 'CONFIRMED' : 'PENDING_RECONCILIATION';

  db.prepare(`
    INSERT INTO cfr_payments (
      id, order_id, invoice_id, method, amount_paise, status, upi_uri, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.order_id,
    params.invoice_id || null,
    params.method,
    params.amount_paise,
    initialStatus,
    params.upi_uri || null,
    now
  );

  return {
    id,
    order_id: params.order_id,
    invoice_id: params.invoice_id || null,
    method: params.method,
    amount_paise: params.amount_paise,
    status: initialStatus,
    upi_uri: params.upi_uri || null,
    created_at: now,
  };
}

/**
 * Reconciles payment manually using the customer's 12-digit UPI UTR reference.
 * Used during offline WAN outages or when customer pays via alternate QR.
 */
export function reconcileManualUtr(
  db: Database.Database,
  params: {
    payment_id?: string;
    order_id?: string;
    utr: string;
    invoice_id?: string;
  }
): CfrPaymentRecord {
  if (!isValidUtr(params.utr)) {
    throw new InvalidUtrError(params.utr);
  }

  const cleanUtr = normalizeUtr(params.utr);
  const now = new Date().toISOString();

  let updatedRecord: CfrPaymentRecord | null = null;

  db.transaction(() => {
    // 1. Locate existing record or fetch by order_id
    let record = (
      params.payment_id
        ? db.prepare('SELECT * FROM cfr_payments WHERE id = ?').get(params.payment_id)
        : params.order_id
        ? db.prepare('SELECT * FROM cfr_payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1').get(params.order_id)
        : null
    ) as CfrPaymentRecord | undefined;

    if (!record) {
      if (!params.order_id) {
        throw new Error('Either payment_id or order_id must be provided to reconcile UTR.');
      }
      // If no prior payment record exists, create one as UPI_MANUAL
      const newPayId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO cfr_payments (
          id, order_id, invoice_id, method, amount_paise, status, utr_ref, reconciled_at, created_at
        ) VALUES (?, ?, ?, 'UPI_MANUAL', 0, 'CONFIRMED', ?, ?, ?)
      `).run(newPayId, params.order_id, params.invoice_id || null, cleanUtr, now, now);

      record = db.prepare('SELECT * FROM cfr_payments WHERE id = ?').get(newPayId) as CfrPaymentRecord;
    } else {
      // Update existing record
      db.prepare(`
        UPDATE cfr_payments
        SET status = 'CONFIRMED',
            utr_ref = ?,
            method = CASE WHEN method = 'UPI_DYNAMIC' THEN 'UPI_DYNAMIC' ELSE 'UPI_MANUAL' END,
            invoice_id = COALESCE(?, invoice_id),
            reconciled_at = ?
        WHERE id = ?
      `).run(cleanUtr, params.invoice_id || null, now, record.id);
    }

    // Also update invoice payment_ref if invoice exists
    const invId = params.invoice_id || record.invoice_id;
    if (invId) {
      db.prepare(`
        UPDATE cfr_invoices
        SET payment_ref = ?, payment_method = 'UPI_MANUAL'
        WHERE id = ? OR order_id = ?
      `).run(cleanUtr, invId, record.order_id);
    }

    updatedRecord = db.prepare('SELECT * FROM cfr_payments WHERE id = ?').get(record.id) as CfrPaymentRecord;
  })();

  if (!updatedRecord) {
    throw new Error('Failed to reconcile UTR inside database transaction.');
  }

  return updatedRecord;
}

/**
 * Reconciles payment via automated gateway webhook or status poll (e.g. Razorpay POS / Smart QR).
 */
export function reconcileGatewayPayment(
  db: Database.Database,
  params: {
    payment_id: string;
    gateway_payment_id: string;
    status: 'CONFIRMED' | 'FAILED';
  }
): CfrPaymentRecord {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE cfr_payments
    SET status = ?,
        gateway_payment_id = ?,
        reconciled_at = ?
    WHERE id = ?
  `).run(params.status, params.gateway_payment_id, now, params.payment_id);

  const updated = db.prepare('SELECT * FROM cfr_payments WHERE id = ?').get(params.payment_id) as CfrPaymentRecord | undefined;
  if (!updated) {
    throw new Error(`Payment record "${params.payment_id}" not found.`);
  }

  return updated;
}

/**
 * Retrieves all payments currently pending verification.
 */
export function getPendingReconciliations(db: Database.Database): CfrPaymentRecord[] {
  return db
    .prepare("SELECT * FROM cfr_payments WHERE status = 'PENDING_RECONCILIATION' ORDER BY created_at DESC")
    .all() as CfrPaymentRecord[];
}

/**
 * Retrieves a single payment record by ID.
 */
export function getPaymentRecord(db: Database.Database, id: string): CfrPaymentRecord | null {
  return (db.prepare('SELECT * FROM cfr_payments WHERE id = ?').get(id) as CfrPaymentRecord) || null;
}

