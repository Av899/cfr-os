/**
 * CFR OS: Express API Routes
 * Mounts dedicated CFR OS endpoints under /api/cfr/
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../../db';
import { validateIngredient, isDietarySafe, DietaryViolationError, parseDietaryFlags } from '../dietary/guard';
import { CfrIngredient } from '../types/dietary';
import { calculateHaryanaGst, validatePriceIncrement, InvalidPriceIncrementError } from '../money/gst-engine';
import { issueCfrInvoice, issueCfrCreditNote, CfrInvoiceRecord } from '../invoicing/sequence';
import { generateThermalReceiptText, ReceiptItem } from '../templates/thermal-receipt';
import { generateUpiQr, isValidUtr } from '../payments/upi-qr';
import {
  createPaymentRecord,
  reconcileManualUtr,
  reconcileGatewayPayment,
  getPendingReconciliations,
  getPaymentRecord,
  InvalidUtrError,
} from '../payments/reconciler';

export const cfrRouter = Router();

/**
 * GET /api/cfr/health
 * Returns CFR OS module health, database version, and summary stats.
 */
cfrRouter.get('/health', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const versionRow = db.prepare("SELECT value FROM cfr_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    const ingredientCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_ingredients').get() as { count: number }).count;
    const recipeCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_recipes').get() as { count: number }).count;
    const invoiceCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_invoices').get() as { count: number }).count;
    const pendingPaymentCount = (
      db.prepare("SELECT COUNT(*) as count FROM cfr_payments WHERE status = 'PENDING_RECONCILIATION'").get() as {
        count: number;
      }
    ).count;

    res.json({
      status: 'ok',
      brand: 'Coffee First Ritual (CFR)',
      location: 'Sector 12, Karnal, Haryana',
      dietary_policy: '100% Vegetarian & Artisanal Eggless (Zero Tolerance)',
      gst_policy: 'Haryana 5% GST (2.5% CGST + 2.5% SGST) + Roundoff',
      price_guard: 'Strict ₹10 Price Increments',
      payments_policy: 'Dynamic UPI QR + Dual-Track WAN Offline Resilience',
      schema_version: Number(versionRow?.value || 1),
      counts: {
        ingredients: ingredientCount,
        recipes: recipeCount,
        invoices: invoiceCount,
        pending_reconciliations: pendingPaymentCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to check CFR health' });
  }
});

/**
 * GET /api/cfr/ingredients
 * Returns all CFR ingredients.
 */
cfrRouter.get('/ingredients', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const ingredients = db.prepare(`
      SELECT id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags, created_at, updated_at
      FROM cfr_ingredients
      ORDER BY category, name
    `).all() as CfrIngredient[];

    res.json({
      total: ingredients.length,
      ingredients,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch ingredients' });
  }
});

/**
 * POST /api/cfr/ingredients
 * Adds a new ingredient, strictly guarded by the 100% vegetarian & eggless policy.
 */
cfrRouter.post('/ingredients', (req: Request, res: Response) => {
  try {
    const { id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags } = req.body;

    if (!name || !category || !base_unit || !dietary_flags) {
      return res.status(400).json({ error: 'Missing required fields (name, category, base_unit, dietary_flags)' });
    }

    const ingredientId = id || `ing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const candidate: Pick<CfrIngredient, 'name' | 'dietary_flags'> = {
      name: String(name).trim(),
      dietary_flags: String(dietary_flags).trim(),
    };

    validateIngredient(candidate);

    const db = getDatabase();
    db.prepare(`
      INSERT INTO cfr_ingredients (
        id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ingredientId,
      candidate.name,
      category,
      base_unit,
      cost_per_unit_paise || 0,
      par_level || 0,
      candidate.dietary_flags,
      now,
      now
    );

    res.status(201).json({
      message: 'Ingredient created successfully',
      ingredient: {
        id: ingredientId,
        name: candidate.name,
        category,
        base_unit,
        cost_per_unit_paise: cost_per_unit_paise || 0,
        par_level: par_level || 0,
        dietary_flags: candidate.dietary_flags,
      },
    });
  } catch (error: any) {
    if (error instanceof DietaryViolationError || error.name === 'DietaryViolationError' || error.code === 'ERR_CFR_DIETARY_VIOLATION') {
      return res.status(422).json({
        error: error.message,
        banned_flag: error.bannedFlag,
        code: error.code,
      });
    }
    if (error?.message?.includes('CHECK constraint failed')) {
      return res.status(422).json({
        error: 'Database constraint violation: Ingredient contains forbidden non-vegetarian flags.',
        code: 'ERR_DB_CHECK_FAILED',
      });
    }
    res.status(500).json({ error: error?.message || 'Failed to create ingredient' });
  }
});

/**
 * POST /api/cfr/dietary/validate
 * Inspects any recipe or list of flags to confirm dietary safety.
 */
cfrRouter.post('/dietary/validate', (req: Request, res: Response) => {
  try {
    const { items, flags } = req.body;

    if (flags) {
      const safe = isDietarySafe(flags);
      return res.json({
        safe,
        flags: parseDietaryFlags(flags),
        policy: '100% Vegetarian & Artisanal Eggless',
      });
    }

    if (Array.isArray(items)) {
      const violations: { item: string; flag: string }[] = [];
      for (const item of items) {
        const itemFlags = parseDietaryFlags(item.dietary_flags);
        for (const f of itemFlags) {
          if (!isDietarySafe(f)) {
            violations.push({ item: item.name || 'Unnamed item', flag: f });
          }
        }
      }

      return res.json({
        safe: violations.length === 0,
        violations,
        policy: '100% Vegetarian & Artisanal Eggless',
      });
    }

    res.status(400).json({ error: 'Provide either "flags" string or "items" array' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to validate dietary safety' });
  }
});

/**
 * POST /api/cfr/invoices/preview
 * Calculates Haryana 5% GST and validates ₹10 price increments for an order before settlement.
 */
cfrRouter.post('/invoices/preview', (req: Request, res: Response) => {
  try {
    const { taxable_paise, items } = req.body;

    let subtotalPaise = 0;

    if (Array.isArray(items)) {
      for (const item of items) {
        const rate = item.rate_paise || item.price_paise || 0;
        const qty = item.quantity || 1;
        // Validate ₹10 price increment
        validatePriceIncrement(rate, item.name);
        subtotalPaise += rate * qty;
      }
    } else if (typeof taxable_paise === 'number') {
      subtotalPaise = taxable_paise;
    } else {
      return res.status(400).json({ error: 'Provide either "items" array or "taxable_paise" integer' });
    }

    const gst = calculateHaryanaGst(subtotalPaise);
    res.json({
      taxable_subtotal: gst.taxable_paise,
      gst_breakdown: gst,
    });
  } catch (error: any) {
    if (error instanceof InvalidPriceIncrementError || error.name === 'InvalidPriceIncrementError') {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    res.status(500).json({ error: error?.message || 'Failed to compute GST preview' });
  }
});

/**
 * POST /api/cfr/invoices/issue
 * Issues an official gap-free FY GST invoice on payment completion.
 */
cfrRouter.post('/invoices/issue', (req: Request, res: Response) => {
  try {
    const { order_id, taxable_paise, payment_method, payment_ref, items } = req.body;

    if (!order_id || typeof taxable_paise !== 'number' || !payment_method) {
      return res.status(400).json({ error: 'Missing required fields: order_id, taxable_paise, payment_method' });
    }

    // Validate ₹10 increments on items if passed
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.rate_paise) {
          validatePriceIncrement(item.rate_paise, item.name);
        }
      }
    }

    const db = getDatabase();
    const result = issueCfrInvoice(db, {
      order_id,
      taxable_paise,
      payment_method,
      payment_ref,
    });

    res.status(201).json({
      message: 'Invoice issued successfully',
      invoice: result.invoice,
      gst: result.gst,
    });
  } catch (error: any) {
    if (error instanceof InvalidPriceIncrementError) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    res.status(500).json({ error: error?.message || 'Failed to issue CFR invoice' });
  }
});

/**
 * GET /api/cfr/invoices
 * Lists issued invoices.
 */
cfrRouter.get('/invoices', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { fy, limit = 50 } = req.query;

    let query = 'SELECT * FROM cfr_invoices';
    const params: any[] = [];

    if (fy) {
      query += ' WHERE fy = ?';
      params.push(String(fy));
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Number(limit));

    const invoices = db.prepare(query).all(...params) as CfrInvoiceRecord[];
    res.json({
      total: invoices.length,
      invoices,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch invoices' });
  }
});

/**
 * GET /api/cfr/invoices/:id
 * Fetches a single invoice with full GST breakdown.
 */
cfrRouter.get('/invoices/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const invoiceId = String(req.params.id);
    const inv = db
      .prepare('SELECT * FROM cfr_invoices WHERE id = ? OR invoice_number = ?')
      .get(invoiceId, invoiceId) as CfrInvoiceRecord | undefined;

    if (!inv) {
      return res.status(404).json({ error: `Invoice "${invoiceId}" not found` });
    }

    const gst = calculateHaryanaGst(inv.taxable_paise);
    res.json({
      invoice: inv,
      gst,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch invoice' });
  }
});

/**
 * POST /api/cfr/invoices/:id/void
 * Voids an invoice by issuing an official sequential Credit Note.
 */
cfrRouter.post('/invoices/:id/void', (req: Request, res: Response) => {
  try {
    const { reason = 'Order cancelled by customer' } = req.body;
    const db = getDatabase();
    const invoiceId = String(req.params.id);

    const creditNote = issueCfrCreditNote(db, {
      invoice_id: invoiceId,
      reason: String(reason),
    });

    res.status(201).json({
      message: 'Invoice voided and credit note issued successfully',
      credit_note: creditNote,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to void invoice' });
  }
});

/**
 * GET /api/cfr/invoices/:id/receipt-text
 * Generates formatted 80mm thermal receipt text for the invoice.
 */
cfrRouter.get('/invoices/:id/receipt-text', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const invoiceId = String(req.params.id);
    const inv = db
      .prepare('SELECT * FROM cfr_invoices WHERE id = ? OR invoice_number = ?')
      .get(invoiceId, invoiceId) as CfrInvoiceRecord | undefined;

    if (!inv) {
      return res.status(404).json({ error: `Invoice "${invoiceId}" not found` });
    }

    const gst = calculateHaryanaGst(inv.taxable_paise);

    // Mock/sample items if line items aren't stored separately yet
    const items: ReceiptItem[] = [
      {
        name: 'Specialty Beverage & Bakery Items',
        quantity: 1,
        rate_paise: inv.taxable_paise,
        amount_paise: inv.taxable_paise,
      },
    ];

    const receiptText = generateThermalReceiptText(inv, gst, items);

    res.type('text/plain').send(receiptText);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to generate receipt text' });
  }
});

/**
 * POST /api/cfr/payments/upi-qr
 * Generates dynamic NPCI UPI Payment QR code for an order.
 */
cfrRouter.post('/payments/upi-qr', async (req: Request, res: Response) => {
  try {
    const { order_id, amount_paise, invoice_number, note } = req.body;

    if (!order_id || typeof amount_paise !== 'number' || amount_paise <= 0) {
      return res.status(400).json({ error: 'Missing required parameters: order_id, amount_paise (> 0)' });
    }

    const qrResult = await generateUpiQr({
      amountPaise: amount_paise,
      orderId: String(order_id),
      invoiceNumber: invoice_number ? String(invoice_number) : undefined,
      note: note ? String(note) : undefined,
    });

    const db = getDatabase();
    const payment = createPaymentRecord(db, {
      order_id: String(order_id),
      method: 'UPI_DYNAMIC',
      amount_paise,
      upi_uri: qrResult.uri,
    });

    res.status(201).json({
      payment_id: payment.id,
      uri: qrResult.uri,
      qr_data_url: qrResult.qrDataUrl,
      amount_paise: qrResult.amountPaise,
      amount_rupees: qrResult.amountRupees,
      payee_vpa: qrResult.payeeVpa,
      payee_name: qrResult.payeeName,
      expires_at: qrResult.expiresAt,
      txn_ref: qrResult.txnRef,
      status: payment.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to generate dynamic UPI QR' });
  }
});

/**
 * POST /api/cfr/payments/reconcile-manual
 * Reconciles payment manually using 12-digit Indian Bank UTR when offline or un-webhooked.
 */
cfrRouter.post('/payments/reconcile-manual', (req: Request, res: Response) => {
  try {
    const { payment_id, order_id, utr, invoice_id } = req.body;

    if (!utr) {
      return res.status(400).json({ error: 'Missing required parameter: utr' });
    }

    const db = getDatabase();
    const updatedPayment = reconcileManualUtr(db, {
      payment_id: payment_id ? String(payment_id) : undefined,
      order_id: order_id ? String(order_id) : undefined,
      utr: String(utr),
      invoice_id: invoice_id ? String(invoice_id) : undefined,
    });

    res.json({
      message: 'Payment reconciled via manual UPI UTR',
      payment: updatedPayment,
    });
  } catch (error: any) {
    if (error instanceof InvalidUtrError || error.name === 'InvalidUtrError' || error.code === 'ERR_CFR_INVALID_UTR') {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    res.status(500).json({ error: error?.message || 'Failed to reconcile payment' });
  }
});

/**
 * POST /api/cfr/payments/webhook
 * Handles simulated or live gateway webhook confirmation (Razorpay POS / Smart QR).
 */
cfrRouter.post('/payments/webhook', (req: Request, res: Response) => {
  try {
    const { payment_id, gateway_payment_id, status = 'CONFIRMED' } = req.body;

    if (!payment_id || !gateway_payment_id) {
      return res.status(400).json({ error: 'Missing required parameters: payment_id, gateway_payment_id' });
    }

    const db = getDatabase();
    const updated = reconcileGatewayPayment(db, {
      payment_id: String(payment_id),
      gateway_payment_id: String(gateway_payment_id),
      status: status === 'FAILED' ? 'FAILED' : 'CONFIRMED',
    });

    res.json({
      message: 'Payment updated from gateway webhook',
      payment: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to process payment webhook' });
  }
});

/**
 * GET /api/cfr/payments/pending
 * Lists all pending reconciliation records.
 */
cfrRouter.get('/payments/pending', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const pending = getPendingReconciliations(db);
    res.json({
      total: pending.length,
      pending,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch pending reconciliations' });
  }
});

/**
 * GET /api/cfr/payments/:id
 * Fetches the status of a specific payment by ID.
 */
cfrRouter.get('/payments/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const payment = getPaymentRecord(db, String(req.params.id));
    if (!payment) {
      return res.status(404).json({ error: `Payment "${req.params.id}" not found` });
    }
    res.json({ payment });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch payment' });
  }
});

