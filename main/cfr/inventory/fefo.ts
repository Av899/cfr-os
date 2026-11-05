/**
 * CFR OS: FEFO (First-Expiry, First-Out) Inventory Engine
 * Ensures stock nearing expiration is always allocated first.
 * Maintains an immutable audit trail in cfr_stock_movements.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  CfrStockLot,
  CfrStockMovement,
  CfrStockMovementType,
  CfrWasteReason,
  FefoLotAllocation,
  IngredientStockSummary,
} from '../types/inventory';

/**
 * Rounds a quantity to 4 decimal places to prevent floating point drift.
 */
function roundQty(qty: number): number {
  return Math.round(qty * 10000) / 10000;
}

export interface FefoAllocationResult {
  ingredient_id: string;
  total_needed: number;
  allocations: FefoLotAllocation[];
  unallocated_qty: number;
  total_cost_paise: number;
}

/**
 * Allocates stock from available lots using First-Expiry-First-Out (FEFO).
 * Automatically cascades across multiple lots if a single lot does not satisfy the total quantity.
 */
export function allocateFefoStock(
  db: Database.Database,
  ingredientId: string,
  quantityToDeduct: number,
  movementType: CfrStockMovementType,
  reason: string | null = null,
  orderId: string | null = null,
): FefoAllocationResult {
  if (quantityToDeduct <= 0) {
    return {
      ingredient_id: ingredientId,
      total_needed: 0,
      allocations: [],
      unallocated_qty: 0,
      total_cost_paise: 0,
    };
  }

  let needed = roundQty(quantityToDeduct);
  const allocations: FefoLotAllocation[] = [];
  let totalCostPaise = 0;
  const now = new Date().toISOString();

  // Query active lots with remaining quantity, strictly sorted by earliest expiry date
  const activeLots = db
    .prepare(
      `
    SELECT id, batch_no, expiry_date, remaining_qty, unit_cost_paise
    FROM cfr_stock_lots
    WHERE ingredient_id = ? AND remaining_qty > 0
    ORDER BY expiry_date ASC, received_at ASC
  `,
    )
    .all(ingredientId) as Array<{
    id: string;
    batch_no: string;
    expiry_date: string;
    remaining_qty: number;
    unit_cost_paise: number;
  }>;

  const updateLotStmt = db.prepare(`
    UPDATE cfr_stock_lots
    SET remaining_qty = ?
    WHERE id = ?
  `);

  const insertMovementStmt = db.prepare(`
    INSERT INTO cfr_stock_movements (id, ingredient_id, lot_id, type, qty, reason, order_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const lot of activeLots) {
    if (needed <= 0) break;

    const available = roundQty(lot.remaining_qty);
    const deduct = roundQty(Math.min(available, needed));
    if (deduct <= 0) continue;

    const newRemaining = roundQty(available - deduct);
    updateLotStmt.run(newRemaining, lot.id);

    // Record audit movement for this lot
    const movementId = `mov_${randomUUID()}`;
    insertMovementStmt.run(
      movementId,
      ingredientId,
      lot.id,
      movementType,
      deduct,
      reason,
      orderId,
      now,
    );

    const costForBatch = Math.round(deduct * lot.unit_cost_paise);
    totalCostPaise += costForBatch;

    allocations.push({
      lot_id: lot.id,
      batch_no: lot.batch_no,
      expiry_date: lot.expiry_date,
      qty_deducted: deduct,
      unit_cost_paise: lot.unit_cost_paise,
    });

    needed = roundQty(needed - deduct);
  }

  // If stock lots did not fully cover the needed amount, log an unallocated deficit movement
  // so the cafe never stops operations while retaining full variance visibility.
  if (needed > 0) {
    const deficitMovementId = `mov_unallocated_${randomUUID()}`;
    insertMovementStmt.run(
      deficitMovementId,
      ingredientId,
      null,
      movementType,
      needed,
      reason ? `${reason}_DEFICIT` : 'DEFICIT_UNALLOCATED',
      orderId,
      now,
    );
  }

  return {
    ingredient_id: ingredientId,
    total_needed: quantityToDeduct,
    allocations,
    unallocated_qty: needed,
    total_cost_paise: totalCostPaise,
  };
}

/**
 * Reverses all FEFO deductions for a cancelled or voided order.
 * Restores remaining_qty on the exact lots that were originally depleted.
 */
export function reverseOrderFefoStock(
  db: Database.Database,
  orderId: string,
): { reversedCount: number; restoredMovements: CfrStockMovement[] } {
  const originalMovements = db
    .prepare(
      `
    SELECT id, ingredient_id, lot_id, type, qty, reason, order_id, created_at
    FROM cfr_stock_movements
    WHERE order_id = ? AND type = 'DEDUCTION_ORDER'
  `,
    )
    .all(orderId) as CfrStockMovement[];

  if (originalMovements.length === 0) {
    return { reversedCount: 0, restoredMovements: [] };
  }

  const updateLotStmt = db.prepare(`
    UPDATE cfr_stock_lots
    SET remaining_qty = remaining_qty + ?
    WHERE id = ?
  `);

  const insertMovementStmt = db.prepare(`
    INSERT INTO cfr_stock_movements (id, ingredient_id, lot_id, type, qty, reason, order_id, created_at)
    VALUES (?, ?, ?, 'REVERSAL', ?, 'ORDER_CANCELLED', ?, ?)
  `);

  const now = new Date().toISOString();
  const restoredMovements: CfrStockMovement[] = [];

  for (const mov of originalMovements) {
    if (mov.lot_id) {
      updateLotStmt.run(mov.qty, mov.lot_id);
    }

    const reversalId = `rev_${randomUUID()}`;
    insertMovementStmt.run(
      reversalId,
      mov.ingredient_id,
      mov.lot_id,
      mov.qty,
      orderId,
      now,
    );

    restoredMovements.push({
      id: reversalId,
      ingredient_id: mov.ingredient_id,
      lot_id: mov.lot_id,
      type: 'REVERSAL',
      qty: mov.qty,
      reason: 'ORDER_CANCELLED',
      order_id: orderId,
      created_at: now,
    });
  }

  return {
    reversedCount: originalMovements.length,
    restoredMovements,
  };
}

/**
 * Records receipt of a new supplier stock lot.
 */
export function receiveStockLot(
  db: Database.Database,
  lot: {
    ingredient_id: string;
    batch_no: string;
    supplier_name?: string | null;
    expiry_date: string; // YYYY-MM-DD
    initial_qty: number;
    unit_cost_paise?: number;
    received_at?: string;
  },
): CfrStockLot {
  const now = new Date().toISOString();
  const id = `lot_${randomUUID()}`;
  const initialQty = roundQty(lot.initial_qty);
  const receivedAt = lot.received_at || now;
  const unitCostPaise = Math.round(lot.unit_cost_paise || 0);

  db.prepare(`
    INSERT INTO cfr_stock_lots (
      id, ingredient_id, batch_no, supplier_name, received_at,
      expiry_date, initial_qty, remaining_qty, unit_cost_paise, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    lot.ingredient_id,
    lot.batch_no,
    lot.supplier_name || null,
    receivedAt,
    lot.expiry_date,
    initialQty,
    initialQty,
    unitCostPaise,
    now,
  );

  // Record audit movement for initial stock purchase
  db.prepare(`
    INSERT INTO cfr_stock_movements (id, ingredient_id, lot_id, type, qty, reason, order_id, created_at)
    VALUES (?, ?, ?, 'PURCHASE', ?, 'SUPPLIER_DELIVERY', NULL, ?)
  `).run(`mov_${randomUUID()}`, lot.ingredient_id, id, initialQty, now);

  return {
    id,
    ingredient_id: lot.ingredient_id,
    batch_no: lot.batch_no,
    supplier_name: lot.supplier_name || null,
    received_at: receivedAt,
    expiry_date: lot.expiry_date,
    initial_qty: initialQty,
    remaining_qty: initialQty,
    unit_cost_paise: unitCostPaise,
    created_at: now,
  };
}

/**
 * Records zero-revenue waste or spillage (barista dial-in shots, milk purges, dropped pastries).
 */
export function recordWaste(
  db: Database.Database,
  waste: {
    ingredient_id: string;
    qty: number;
    reason: CfrWasteReason | string;
    lot_id?: string | null;
  },
): FefoAllocationResult {
  const now = new Date().toISOString();
  const qty = roundQty(waste.qty);

  if (waste.lot_id) {
    // Specific lot specified by barista / baker
    const lot = db
      .prepare('SELECT * FROM cfr_stock_lots WHERE id = ?')
      .get(waste.lot_id) as CfrStockLot | undefined;

    if (!lot) {
      throw new Error(`Stock lot "${waste.lot_id}" not found.`);
    }

    const available = roundQty(lot.remaining_qty);
    const deduct = roundQty(Math.min(available, qty));
    const newRemaining = roundQty(available - deduct);

    db.prepare('UPDATE cfr_stock_lots SET remaining_qty = ? WHERE id = ?').run(
      newRemaining,
      lot.id,
    );

    const movementId = `mov_waste_${randomUUID()}`;
    db.prepare(`
      INSERT INTO cfr_stock_movements (id, ingredient_id, lot_id, type, qty, reason, order_id, created_at)
      VALUES (?, ?, ?, 'WASTE', ?, ?, NULL, ?)
    `).run(movementId, waste.ingredient_id, lot.id, deduct, waste.reason, now);

    const unallocated = roundQty(qty - deduct);
    if (unallocated > 0) {
      db.prepare(`
        INSERT INTO cfr_stock_movements (id, ingredient_id, lot_id, type, qty, reason, order_id, created_at)
        VALUES (?, ?, NULL, 'WASTE', ?, ?, NULL, ?)
      `).run(
        `mov_waste_unalloc_${randomUUID()}`,
        waste.ingredient_id,
        unallocated,
        `${waste.reason}_DEFICIT`,
        now,
      );
    }

    return {
      ingredient_id: waste.ingredient_id,
      total_needed: qty,
      allocations: [
        {
          lot_id: lot.id,
          batch_no: lot.batch_no,
          expiry_date: lot.expiry_date,
          qty_deducted: deduct,
          unit_cost_paise: lot.unit_cost_paise,
        },
      ],
      unallocated_qty: unallocated,
      total_cost_paise: Math.round(deduct * lot.unit_cost_paise),
    };
  }

  // No lot specified: allocate automatically using FEFO
  return allocateFefoStock(
    db,
    waste.ingredient_id,
    qty,
    'WASTE',
    waste.reason,
    null,
  );
}

/**
 * Returns a comprehensive stock summary across all ingredients with FEFO lots and par level status.
 */
export function getInventoryStockLevels(
  db: Database.Database,
  ingredientId?: string,
): IngredientStockSummary[] {
  let query = `
    SELECT id, name, category, base_unit, par_level
    FROM cfr_ingredients
  `;
  const params: unknown[] = [];

  if (ingredientId) {
    query += ' WHERE id = ?';
    params.push(ingredientId);
  }

  query += ' ORDER BY category, name';

  const ingredients = db.prepare(query).all(...params) as Array<{
    id: string;
    name: string;
    category: string;
    base_unit: any;
    par_level: number;
  }>;

  const lotsStmt = db.prepare(`
    SELECT id, batch_no, expiry_date, remaining_qty, unit_cost_paise
    FROM cfr_stock_lots
    WHERE ingredient_id = ? AND remaining_qty > 0
    ORDER BY expiry_date ASC, received_at ASC
  `);

  return ingredients.map((ing) => {
    const lots = lotsStmt.all(ing.id) as Array<{
      id: string;
      batch_no: string;
      expiry_date: string;
      remaining_qty: number;
      unit_cost_paise: number;
    }>;

    const currentStock = roundQty(
      lots.reduce((acc, lot) => acc + Number(lot.remaining_qty), 0),
    );
    const earliestExpiry = lots.length > 0 ? lots[0].expiry_date : null;

    return {
      id: ing.id,
      name: ing.name,
      category: ing.category,
      base_unit: ing.base_unit,
      par_level: ing.par_level,
      current_stock: currentStock,
      is_low_stock: currentStock < ing.par_level,
      earliest_expiry: earliestExpiry,
      active_lots_count: lots.length,
      lots,
    };
  });
}

