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
import {
  allocateFefoStock,
  reverseOrderFefoStock,
  receiveStockLot,
  recordWaste,
  getInventoryStockLevels,
} from '../inventory/fefo';
import {
  deductOrderBOM,
  reverseOrderBOM,
  resolveOrderItemIngredients,
  seedStandardCfrRecipes,
} from '../inventory/bom';
import { CfrWasteReason } from '../types/inventory';
import {
  listBeanLots,
  createBeanLot,
  getActiveBeanLot,
  setActiveBeanLot,
} from '../coffee/bean-lots';
import {
  getPrimaryGrinder,
  resetGrinderBurrs,
} from '../coffee/burr-wear';
import {
  logDialIn,
  getLatestDialIn,
  listDialInHistory,
  InvalidDialInParametersError,
} from '../coffee/dial-in';
import {
  getPublicDigitalMenu,
  getMenuItemById,
  setMenuItemAvailability,
} from '../menu/menu-engine';
import { ovenAdapter } from '../adapters/oven-adapter';
import { espressoAdapter } from '../adapters/espresso-adapter';
import { pagerAdapter } from '../adapters/pager-adapter';
import { ambienceAdapter } from '../adapters/ambience-adapter';
import { CfrAmbienceScene } from '../types/menu-adapters';

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
    const beanLotCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_bean_lots').get() as { count: number }).count;
    const dialInCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_dial_in_logs').get() as { count: number }).count;
    const menuItemCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_menu_items').get() as { count: number }).count;

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
        bean_lots: beanLotCount,
        dial_in_records: dialInCount,
        menu_items: menuItemCount,
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

/**
 * ── Week 4: Gram-Level BOM & FEFO Inventory Endpoints ───────────────────────
 */

/**
 * GET /api/cfr/inventory/stock
 * Returns current stock levels, active FEFO lots, and par level alerts.
 */
cfrRouter.get('/inventory/stock', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const ingredientId = req.query.ingredient_id ? String(req.query.ingredient_id) : undefined;
    const stockLevels = getInventoryStockLevels(db, ingredientId);

    const lowStockItems = stockLevels.filter((item) => item.is_low_stock);

    res.json({
      total_ingredients: stockLevels.length,
      low_stock_count: lowStockItems.length,
      stock: stockLevels,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch inventory stock' });
  }
});

/**
 * POST /api/cfr/inventory/lots
 * Receives a new stock shipment lot.
 */
cfrRouter.post('/inventory/lots', (req: Request, res: Response) => {
  try {
    const { ingredient_id, batch_no, supplier_name, expiry_date, initial_qty, unit_cost_paise, received_at } = req.body;

    if (!ingredient_id || !batch_no || !expiry_date || initial_qty === undefined || Number(initial_qty) <= 0) {
      return res.status(400).json({
        error: 'Missing or invalid lot details (ingredient_id, batch_no, expiry_date [YYYY-MM-DD], initial_qty > 0 required)',
      });
    }

    const db = getDatabase();
    const lot = receiveStockLot(db, {
      ingredient_id,
      batch_no,
      supplier_name,
      expiry_date,
      initial_qty: Number(initial_qty),
      unit_cost_paise: Number(unit_cost_paise) || 0,
      received_at,
    });

    res.status(201).json({
      message: `Stock lot "${batch_no}" received successfully`,
      lot,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to receive stock lot' });
  }
});

/**
 * POST /api/cfr/inventory/waste
 * Logs zero-revenue barista waste (dial-in shots, milk purges, expired items, dropped pastries).
 */
cfrRouter.post('/inventory/waste', (req: Request, res: Response) => {
  try {
    const { ingredient_id, qty, reason, lot_id } = req.body;

    if (!ingredient_id || qty === undefined || Number(qty) <= 0 || !reason) {
      return res.status(400).json({
        error: 'Missing required waste fields (ingredient_id, qty > 0, reason)',
      });
    }

    const db = getDatabase();
    const result = recordWaste(db, {
      ingredient_id,
      qty: Number(qty),
      reason,
      lot_id: lot_id || null,
    });

    res.status(201).json({
      message: 'Waste logged successfully',
      result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to log waste' });
  }
});

/**
 * GET /api/cfr/inventory/movements
 * Returns stock movement audit ledger.
 */
cfrRouter.get('/inventory/movements', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { ingredient_id, order_id, type, limit = 100 } = req.query;

    let query = `
      SELECT sm.*, ing.name as ingredient_name, ing.base_unit
      FROM cfr_stock_movements sm
      JOIN cfr_ingredients ing ON sm.ingredient_id = ing.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (ingredient_id) {
      query += ' AND sm.ingredient_id = ?';
      params.push(String(ingredient_id));
    }
    if (order_id) {
      query += ' AND sm.order_id = ?';
      params.push(String(order_id));
    }
    if (type) {
      query += ' AND sm.type = ?';
      params.push(String(type));
    }

    query += ' ORDER BY sm.created_at DESC LIMIT ?';
    params.push(Number(limit));

    const movements = db.prepare(query).all(...params);

    res.json({
      total: movements.length,
      movements,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch stock movements' });
  }
});

/**
 * GET /api/cfr/recipes
 * Lists all recipes with their line items.
 */
cfrRouter.get('/recipes', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const recipes = db.prepare(`
      SELECT * FROM cfr_recipes ORDER BY is_sub_recipe DESC, name ASC
    `).all() as any[];

    const itemStmt = db.prepare(`
      SELECT ri.*, ing.name as ingredient_name, sub.name as sub_recipe_name
      FROM cfr_recipe_items ri
      LEFT JOIN cfr_ingredients ing ON ri.ingredient_id = ing.id
      LEFT JOIN cfr_recipes sub ON ri.sub_recipe_id = sub.id
      WHERE ri.recipe_id = ?
    `);

    for (const recipe of recipes) {
      recipe.items = itemStmt.all(recipe.id);
    }

    res.json({
      total: recipes.length,
      recipes,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch recipes' });
  }
});

/**
 * ============================================================================
 * WEEK 5: SPECIALTY COFFEE FRESHNESS, DIAL-IN & BURR WEAR ENDPOINTS
 * ============================================================================
 */

/**
 * GET /api/cfr/coffee/lots
 * Lists all registered specialty coffee bean lots with real-time roast age and freshness metrics.
 */
cfrRouter.get('/coffee/lots', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const onlyActive = req.query.active_only === 'true';
    const lots = listBeanLots(db, onlyActive);

    res.json({
      total: lots.length,
      lots,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch coffee bean lots' });
  }
});

/**
 * GET /api/cfr/coffee/lots/active
 * Returns the currently mounted espresso hopper bean lot and its freshness window.
 */
cfrRouter.get('/coffee/lots/active', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const activeLot = getActiveBeanLot(db);

    if (!activeLot) {
      return res.status(404).json({ error: 'No active coffee bean lot currently mounted' });
    }

    res.json({
      active_lot: activeLot,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch active bean lot' });
  }
});

/**
 * POST /api/cfr/coffee/lots
 * Registers a new specialty coffee bean lot from roaster.
 */
cfrRouter.post('/coffee/lots', (req: Request, res: Response) => {
  try {
    const { roaster_name, lot_name, origin, process, roast_date, weight_g, degas_days, peak_days, set_active } = req.body;

    if (!roaster_name || !lot_name || !origin || !roast_date || weight_g === undefined || Number(weight_g) <= 0) {
      return res.status(400).json({
        error: 'Missing required lot fields (roaster_name, lot_name, origin, roast_date [YYYY-MM-DD], weight_g > 0)',
      });
    }

    const db = getDatabase();
    const lot = createBeanLot(db, {
      roaster_name: String(roaster_name),
      lot_name: String(lot_name),
      origin: String(origin),
      process: process ? String(process) : undefined,
      roast_date: String(roast_date),
      weight_g: Number(weight_g),
      degas_days: degas_days ? Number(degas_days) : undefined,
      peak_days: peak_days ? Number(peak_days) : undefined,
      set_active: Boolean(set_active),
    });

    res.status(201).json({
      message: `Coffee lot "${lot.lot_name}" registered successfully`,
      lot,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to create coffee lot' });
  }
});

/**
 * PATCH /api/cfr/coffee/lots/:id/activate
 * Sets a specific bean lot as the active espresso hopper lot.
 */
cfrRouter.patch('/coffee/lots/:id/activate', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const lotId = String(req.params.id);

    setActiveBeanLot(db, lotId);

    const activeLot = getActiveBeanLot(db);
    res.json({
      message: `Bean lot activated on primary grinder`,
      active_lot: activeLot,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to activate bean lot' });
  }
});

/**
 * GET /api/cfr/coffee/dial-in/latest
 * Returns the most recent barista dial-in calibration record.
 */
cfrRouter.get('/coffee/dial-in/latest', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const beanLotId = req.query.bean_lot_id ? String(req.query.bean_lot_id) : undefined;
    const latest = getLatestDialIn(db, beanLotId);

    res.json({
      latest,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch latest dial-in log' });
  }
});

/**
 * POST /api/cfr/coffee/dial-in
 * Logs a barista morning espresso calibration shot.
 * Automatically deducts beans from FEFO inventory and accumulates grinder burr wear.
 */
cfrRouter.post('/coffee/dial-in', (req: Request, res: Response) => {
  try {
    const {
      bean_lot_id,
      dose_grams,
      yield_grams,
      time_seconds,
      grind_setting,
      waste_grams,
      tasting_notes,
      barista_name,
    } = req.body;

    if (dose_grams === undefined || yield_grams === undefined || time_seconds === undefined || !grind_setting) {
      return res.status(400).json({
        error: 'Missing required dial-in parameters (dose_grams, yield_grams, time_seconds, grind_setting)',
      });
    }

    const db = getDatabase();
    const record = logDialIn(db, {
      bean_lot_id: bean_lot_id ? String(bean_lot_id) : undefined,
      dose_grams: Number(dose_grams),
      yield_grams: Number(yield_grams),
      time_seconds: Number(time_seconds),
      grind_setting: String(grind_setting),
      waste_grams: waste_grams !== undefined ? Number(waste_grams) : undefined,
      tasting_notes: tasting_notes ? String(tasting_notes) : undefined,
      barista_name: barista_name ? String(barista_name) : undefined,
    });

    res.status(201).json({
      message: 'Morning espresso dial-in logged successfully',
      record,
    });
  } catch (error: any) {
    if (error instanceof InvalidDialInParametersError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error?.message || 'Failed to log dial-in shot' });
  }
});

/**
 * GET /api/cfr/coffee/dial-in/history
 * Returns historical dial-in calibration shots.
 */
cfrRouter.get('/coffee/dial-in/history', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const history = listDialInHistory(db, limit);

    res.json({
      total: history.length,
      history,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch dial-in history' });
  }
});

/**
 * GET /api/cfr/coffee/grinder/wear
 * Returns commercial grinder details and burr wear lifespan status.
 */
cfrRouter.get('/coffee/grinder/wear', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const grinderId = req.query.grinder_id ? String(req.query.grinder_id) : undefined;
    const grinder = getPrimaryGrinder(db, grinderId);

    res.json({
      grinder,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch grinder wear metrics' });
  }
});

/**
 * POST /api/cfr/coffee/grinder/reset
 * Resets grinder cumulative wear counter to 0kg following burr replacement or sharpening.
 */
cfrRouter.post('/coffee/grinder/reset', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { grinder_id } = req.body;

    if (!grinder_id) {
      return res.status(400).json({ error: 'grinder_id is required' });
    }

    const grinder = resetGrinderBurrs(db, String(grinder_id));

    res.json({
      message: `Burr counter reset to 0kg for ${grinder.name}`,
      grinder,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to reset grinder burrs' });
  }
});

/**
 * ============================================================================
 * WEEK 6: LUXURY DIGITAL GUEST MENU & HARDWARE ADAPTER ENDPOINTS
 * ============================================================================
 */

/**
 * GET /api/cfr/menu
 * Returns the public guest digital menu with the 7 signature sections,
 * tasting notes, craft stories, ₹10 prices, and real-time availability.
 */
cfrRouter.get('/menu', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const includeUnavailable = req.query.include_unavailable !== 'false';
    const menu = getPublicDigitalMenu(db, includeUnavailable);

    res.json(menu);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load public digital menu' });
  }
});

/**
 * GET /api/cfr/menu/item/:id
 * Returns single menu item with full terroir and craft story.
 */
cfrRouter.get('/menu/item/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const item = getMenuItemById(db, String(req.params.id));

    if (!item) {
      return res.status(404).json({ error: `Menu item "${req.params.id}" not found` });
    }

    res.json({ item });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load menu item' });
  }
});

/**
 * PATCH /api/cfr/menu/item/:id/availability
 * Toggles an item's real-time 86'd / sold-out availability on the guest digital menu.
 */
cfrRouter.patch('/menu/item/:id/availability', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { is_available } = req.body;

    if (is_available === undefined) {
      return res.status(400).json({ error: 'is_available boolean is required' });
    }

    const updated = setMenuItemAvailability(db, String(req.params.id), Boolean(is_available));

    res.json({
      message: `Menu item "${updated.name}" is now ${updated.is_available ? 'AVAILABLE' : '86\'D (SOLD OUT)'}`,
      item: updated,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update item availability' });
  }
});

/**
 * GET /api/cfr/equipment/checklists
 * Returns all commercial equipment maintenance tasks (Oven, Espresso, Grinder).
 */
cfrRouter.get('/equipment/checklists', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const type = req.query.type ? String(req.query.type).toUpperCase() : undefined;

    let query = 'SELECT * FROM cfr_equipment_tasks';
    const params: unknown[] = [];
    if (type) {
      query += ' WHERE equipment_type = ?';
      params.push(type);
    }
    query += ' ORDER BY frequency, task_name';

    const tasks = db.prepare(query).all(...params) as any[];

    res.json({
      total: tasks.length,
      tasks: tasks.map((t) => ({ ...t, is_completed: t.is_completed === 1 })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch equipment checklists' });
  }
});

/**
 * POST /api/cfr/equipment/checklists/:id/complete
 * Marks a commercial equipment cleaning or maintenance task as completed.
 */
cfrRouter.post('/equipment/checklists/:id/complete', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const taskId = String(req.params.id);
    const { completed_by = 'Staff Member' } = req.body;
    const now = new Date().toISOString();

    const result = db.prepare(`
      UPDATE cfr_equipment_tasks
      SET is_completed = 1,
          last_completed_at = ?,
          completed_by = ?
      WHERE id = ?
    `).run(now, completed_by, taskId);

    if (result.changes === 0) {
      return res.status(404).json({ error: `Task "${taskId}" not found` });
    }

    const task = db.prepare('SELECT * FROM cfr_equipment_tasks WHERE id = ?').get(taskId) as any;

    res.json({
      message: `Task "${task.task_name}" marked completed`,
      task: { ...task, is_completed: task.is_completed === 1 },
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to complete task' });
  }
});

/**
 * GET /api/cfr/hardware/oven/status
 * Returns Unox Bakertop Combi oven status, actual vs target temperature, and active program.
 */
cfrRouter.get('/hardware/oven/status', (_req: Request, res: Response) => {
  try {
    const status = ovenAdapter.getStatus();
    res.json({ oven: status });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch oven status' });
  }
});

/**
 * GET /api/cfr/hardware/oven/programs
 * Lists available Unox Combi baking programs.
 */
cfrRouter.get('/hardware/oven/programs', (_req: Request, res: Response) => {
  try {
    const programs = ovenAdapter.listPrograms();
    res.json({ programs });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to list oven programs' });
  }
});

/**
 * POST /api/cfr/hardware/oven/program
 * Sets active baking program and target preheat temperature.
 */
cfrRouter.post('/hardware/oven/program', (req: Request, res: Response) => {
  try {
    const { program_id } = req.body;
    if (!program_id) {
      return res.status(400).json({ error: 'program_id is required' });
    }

    const program = ovenAdapter.startProgram(String(program_id));
    res.json({
      message: `Oven program "${program.name}" started. Target: ${program.temperature_celsius}°C`,
      program,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to start oven program' });
  }
});

/**
 * GET /api/cfr/hardware/espresso/telemetry
 * Returns La Marzocco KB90 group temperatures, pressures, and backflushing due status.
 */
cfrRouter.get('/hardware/espresso/telemetry', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const telemetry = espressoAdapter.getTelemetry(db);
    res.json({ espresso_machine: telemetry });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch espresso telemetry' });
  }
});

/**
 * GET /api/cfr/hardware/pager/logs
 * Returns recent server wrist pager buzz logs.
 */
cfrRouter.get('/hardware/pager/logs', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const logs = pagerAdapter.getLogs(db, limit);

    res.json({ total: logs.length, logs });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch pager logs' });
  }
});

/**
 * POST /api/cfr/hardware/pager/buzz
 * Manually buzzes a floor server's wrist pager.
 */
cfrRouter.post('/hardware/pager/buzz', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { message, table_number, server_name, order_id } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required for pager buzz' });
    }

    const event = pagerAdapter.buzzPager(db, {
      message: String(message),
      tableNumber: table_number ? String(table_number) : undefined,
      serverName: server_name ? String(server_name) : undefined,
      orderId: order_id ? String(order_id) : undefined,
    });

    res.status(201).json({
      message: 'Pager buzz alert dispatched',
      event,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to buzz pager' });
  }
});

/**
 * GET /api/cfr/hardware/ambience/current
 * Returns active lighting (DALI/Lutron) and audio (Sonos) scene.
 */
cfrRouter.get('/hardware/ambience/current', (_req: Request, res: Response) => {
  try {
    const preset = ambienceAdapter.getCurrentAmbience();
    res.json({ ambience: preset });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch current ambience' });
  }
});

/**
 * POST /api/cfr/hardware/ambience/override
 * Sets a manual override scene (e.g. for private tasting events).
 */
cfrRouter.post('/hardware/ambience/override', (req: Request, res: Response) => {
  try {
    const { scene, duration_minutes = 60 } = req.body;
    if (!scene || !['WORKSPACE', 'GOLDEN_HOUR', 'EVENING_LOUNGE'].includes(scene)) {
      return res.status(400).json({
        error: "scene must be one of 'WORKSPACE', 'GOLDEN_HOUR', or 'EVENING_LOUNGE'",
      });
    }

    const updated = ambienceAdapter.setOverride(scene as CfrAmbienceScene, Number(duration_minutes));

    res.json({
      message: `Ambience override set to ${scene} for ${duration_minutes} minutes`,
      ambience: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to set ambience override' });
  }
});

/**
 * POST /api/cfr/hardware/ambience/clear
 * Clears any manual override and reverts to time-of-day schedule.
 */
cfrRouter.post('/hardware/ambience/clear', (_req: Request, res: Response) => {
  try {
    const current = ambienceAdapter.clearOverride();
    res.json({
      message: 'Ambience override cleared. Reverted to scheduled scene.',
      ambience: current,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to clear ambience override' });
  }
});




