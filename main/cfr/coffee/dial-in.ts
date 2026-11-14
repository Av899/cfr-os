/**
 * CFR OS: Barista Morning Espresso Dial-in Calibration Engine
 * Logs extraction parameters, calculates brew ratio and flow rate,
 * and ties dial-in waste directly to the FEFO inventory ledger.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { CfrDialInRecord } from '../types/coffee';
import { getActiveBeanLot, deductBeanLotWeight } from './bean-lots';
import { recordGrindUsage, getPrimaryGrinder } from './burr-wear';
import { recordWaste } from '../inventory/fefo';

export class InvalidDialInParametersError extends Error {
  constructor(message: string) {
    super(`Invalid Dial-In Parameters: ${message}`);
    this.name = 'InvalidDialInParametersError';
  }
}

/**
 * Hydrates a raw dial-in database row with calculated extraction ratio and flow rate.
 */
export function hydrateDialInRecord(raw: any): CfrDialInRecord {
  const dose = Number(raw.dose_grams);
  const yieldG = Number(raw.yield_grams);
  const time = Number(raw.time_seconds);

  const ratio = dose > 0 ? Math.round((yieldG / dose) * 100) / 100 : 0;
  const flowRate = time > 0 ? Math.round((yieldG / time) * 100) / 100 : 0;

  return {
    id: raw.id,
    bean_lot_id: raw.bean_lot_id,
    dose_grams: dose,
    yield_grams: yieldG,
    time_seconds: time,
    grind_setting: raw.grind_setting,
    waste_grams: Number(raw.waste_grams || 0),
    tasting_notes: raw.tasting_notes || null,
    barista_name: raw.barista_name || null,
    created_at: raw.created_at,
    ratio,
    flow_rate_gps: flowRate,
    bean_name: raw.lot_name,
    roaster_name: raw.roaster_name,
  };
}

/**
 * Validates and records a morning espresso dial-in calibration shot.
 * Automatically deducts coffee beans from FEFO inventory and accumulates grinder burr wear.
 */
export function logDialIn(
  db: Database.Database,
  input: {
    bean_lot_id?: string;
    dose_grams: number;
    yield_grams: number;
    time_seconds: number;
    grind_setting: string;
    waste_grams?: number;
    tasting_notes?: string;
    barista_name?: string;
  },
): CfrDialInRecord {
  if (input.dose_grams < 10 || input.dose_grams > 30) {
    throw new InvalidDialInParametersError('Dose must be between 10.0g and 30.0g for double espresso calibration');
  }
  if (input.yield_grams < 15 || input.yield_grams > 90) {
    throw new InvalidDialInParametersError('Yield must be between 15.0g and 90.0g');
  }
  if (input.time_seconds < 10 || input.time_seconds > 60) {
    throw new InvalidDialInParametersError('Shot time must be between 10s and 60s');
  }
  if (!input.grind_setting || !input.grind_setting.trim()) {
    throw new InvalidDialInParametersError('Grind setting is required (e.g. 2.4 / Notch 3)');
  }

  // Resolve target bean lot (default to currently active hopper lot)
  let beanLotId = input.bean_lot_id;
  if (!beanLotId) {
    const activeLot = getActiveBeanLot(db);
    if (!activeLot) {
      throw new InvalidDialInParametersError('No active bean lot found. Please register or activate a coffee bean lot first.');
    }
    beanLotId = activeLot.id;
  }

  const dialInId = `dial_${Date.now()}_${randomUUID().substring(0, 6)}`;
  const now = new Date().toISOString();
  const wasteGrams = input.waste_grams ?? input.dose_grams;

  db.transaction(() => {
    // 1. Insert dial-in calibration record
    db.prepare(`
      INSERT INTO cfr_dial_in_logs (
        id, bean_lot_id, dose_grams, yield_grams, time_seconds,
        grind_setting, waste_grams, tasting_notes, barista_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dialInId,
      beanLotId,
      input.dose_grams,
      input.yield_grams,
      input.time_seconds,
      input.grind_setting.trim(),
      wasteGrams,
      input.tasting_notes?.trim() || null,
      input.barista_name?.trim() || null,
      now,
    );

    // 2. Deduct weight from the specific bean lot
    deductBeanLotWeight(db, beanLotId!, wasteGrams);

    // 3. Deduct from FEFO inventory as calibration waste
    try {
      // Find matching ingredient id for coffee beans (or default to primary beans)
      const ingRow = db
        .prepare("SELECT id FROM cfr_ingredients WHERE category = 'coffee_beans' ORDER BY created_at ASC LIMIT 1")
        .get() as { id: string } | undefined;

      if (ingRow) {
        recordWaste(db, {
          ingredient_id: ingRow.id,
          qty: wasteGrams,
          reason: 'DIAL_IN_SHOT',
        });
      }
    } catch (err) {
      console.warn('[CFR Dial-In] FEFO inventory waste log bypassed:', err);
    }

    // 4. Accumulate grinder burr wear
    try {
      const grinder = getPrimaryGrinder(db);
      recordGrindUsage(db, grinder.id, wasteGrams);
    } catch (err) {
      console.warn('[CFR Dial-In] Grinder wear tracking bypassed:', err);
    }
  })();

  const raw = db
    .prepare(`
      SELECT d.*, b.lot_name, b.roaster_name
      FROM cfr_dial_in_logs d
      JOIN cfr_bean_lots b ON d.bean_lot_id = b.id
      WHERE d.id = ?
    `)
    .get(dialInId);

  return hydrateDialInRecord(raw);
}

/**
 * Returns the most recent dial-in calibration record for the active espresso bean.
 */
export function getLatestDialIn(db: Database.Database, beanLotId?: string): CfrDialInRecord | null {
  let query = `
    SELECT d.*, b.lot_name, b.roaster_name
    FROM cfr_dial_in_logs d
    JOIN cfr_bean_lots b ON d.bean_lot_id = b.id
  `;
  const params: any[] = [];

  if (beanLotId) {
    query += ' WHERE d.bean_lot_id = ?';
    params.push(beanLotId);
  } else {
    query += ' WHERE b.is_active = 1';
  }

  query += ' ORDER BY d.created_at DESC LIMIT 1';
  const row = db.prepare(query).get(...params);
  return row ? hydrateDialInRecord(row) : null;
}

/**
 * Lists recent dial-in calibration logs.
 */
export function listDialInHistory(db: Database.Database, limit = 50): CfrDialInRecord[] {
  const rows = db
    .prepare(`
      SELECT d.*, b.lot_name, b.roaster_name
      FROM cfr_dial_in_logs d
      JOIN cfr_bean_lots b ON d.bean_lot_id = b.id
      ORDER BY d.created_at DESC
      LIMIT ?
    `)
    .all(limit);

  return rows.map((r) => hydrateDialInRecord(r));
}
