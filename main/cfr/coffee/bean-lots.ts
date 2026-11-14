/**
 * CFR OS: Specialty Coffee Bean Lot & Degassing Engine
 * Tracks roast age, volatile degassing curves, and active espresso hopper lots.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { CfrBeanLot, CfrFreshnessStatus } from '../types/coffee';

/**
 * Formats a Date object into a local YYYY-MM-DD string.
 */
export function formatLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates calendar days elapsed between roast date (YYYY-MM-DD) and a target date.
 */
export function calculateDaysOffRoast(roastDateStr: string, asOfDate: Date = new Date()): number {
  const cleanDate = (roastDateStr || '').split('T')[0];
  const parts = cleanDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return 0;
  }
  const [year, month, day] = parts;
  const roastUtc = Date.UTC(year, month - 1, day);
  const targetUtc = Date.UTC(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());
  
  const diffMs = targetUtc - roastUtc;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/**
 * Evaluates the specialty coffee freshness stage based on days elapsed off roast.
 */
export function getFreshnessStatus(
  daysOffRoast: number,
  degasDays = 7,
  peakDays = 28,
): CfrFreshnessStatus {
  if (daysOffRoast < degasDays) {
    return {
      stage: 'DEGASSING',
      days_off_roast: daysOffRoast,
      degas_days: degasDays,
      peak_days: peakDays,
      label: `Degassing (Day ${daysOffRoast})`,
      badge_color: 'amber',
      guidance: `Resting volatile CO₂. Peak extraction opens on Day ${degasDays}.`,
    };
  }

  if (daysOffRoast <= peakDays) {
    return {
      stage: 'PEAK',
      days_off_roast: daysOffRoast,
      degas_days: degasDays,
      peak_days: peakDays,
      label: `Peak Flavor (Day ${daysOffRoast})`,
      badge_color: 'emerald',
      guidance: 'Optimal extraction window. Maximum aromatic vibrancy, sweetness, and balanced crema.',
    };
  }

  if (daysOffRoast <= 45) {
    return {
      stage: 'FADING',
      days_off_roast: daysOffRoast,
      degas_days: degasDays,
      peak_days: peakDays,
      label: `Aromas Fading (Day ${daysOffRoast})`,
      badge_color: 'orange',
      guidance: 'Delicate floral/fruit aromatics declining. Recommended: fine-tune grind slightly finer.',
    };
  }

  return {
    stage: 'STALE',
    days_off_roast: daysOffRoast,
    degas_days: degasDays,
    peak_days: peakDays,
    label: `Past Specialty Peak (Day ${daysOffRoast})`,
    badge_color: 'rose',
    guidance: 'Volatile aromatics lost. Recommended for cold brew extraction or retiring lot.',
  };
}

/**
 * Hydrates a raw database bean lot with computed freshness metrics.
 */
export function hydrateBeanLot(raw: any, asOfDate: Date = new Date()): CfrBeanLot {
  const daysOffRoast = calculateDaysOffRoast(raw.roast_date, asOfDate);
  const freshness = getFreshnessStatus(daysOffRoast, raw.degas_days, raw.peak_days);

  return {
    id: raw.id,
    roaster_name: raw.roaster_name,
    lot_name: raw.lot_name,
    origin: raw.origin,
    process: raw.process || 'Washed',
    roast_date: raw.roast_date,
    initial_weight_g: Number(raw.initial_weight_g),
    remaining_weight_g: Number(raw.remaining_weight_g),
    degas_days: Number(raw.degas_days || 7),
    peak_days: Number(raw.peak_days || 28),
    is_active: Number(raw.is_active || 0),
    created_at: raw.created_at,
    freshness,
  };
}

/**
 * Creates and registers a new specialty coffee bean lot.
 */
export function createBeanLot(
  db: Database.Database,
  input: {
    roaster_name: string;
    lot_name: string;
    origin: string;
    process?: string;
    roast_date: string;
    weight_g: number;
    degas_days?: number;
    peak_days?: number;
    set_active?: boolean;
  },
): CfrBeanLot {
  const id = `lot_bean_${Date.now()}_${randomUUID().substring(0, 6)}`;
  const now = new Date().toISOString();
  const degasDays = input.degas_days ?? 7;
  const peakDays = input.peak_days ?? 28;

  db.transaction(() => {
    if (input.set_active) {
      db.prepare('UPDATE cfr_bean_lots SET is_active = 0').run();
    }

    db.prepare(`
      INSERT INTO cfr_bean_lots (
        id, roaster_name, lot_name, origin, process, roast_date,
        initial_weight_g, remaining_weight_g, degas_days, peak_days, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.roaster_name.trim(),
      input.lot_name.trim(),
      input.origin.trim(),
      input.process || 'Washed',
      input.roast_date,
      input.weight_g,
      input.weight_g,
      degasDays,
      peakDays,
      input.set_active ? 1 : 0,
      now,
    );
  })();

  const raw = db.prepare('SELECT * FROM cfr_bean_lots WHERE id = ?').get(id);
  return hydrateBeanLot(raw);
}

/**
 * Lists all bean lots, with active hopper lots sorted first.
 */
export function listBeanLots(db: Database.Database, onlyActive = false): CfrBeanLot[] {
  const query = onlyActive
    ? 'SELECT * FROM cfr_bean_lots WHERE is_active = 1'
    : 'SELECT * FROM cfr_bean_lots ORDER BY is_active DESC, roast_date DESC';

  const rows = db.prepare(query).all();
  return rows.map((r) => hydrateBeanLot(r));
}

/**
 * Returns the currently mounted espresso bean lot.
 */
export function getActiveBeanLot(db: Database.Database): CfrBeanLot | null {
  const row = db.prepare('SELECT * FROM cfr_bean_lots WHERE is_active = 1 LIMIT 1').get();
  return row ? hydrateBeanLot(row) : null;
}

/**
 * Sets a specific bean lot as the active espresso hopper lot.
 */
export function setActiveBeanLot(db: Database.Database, lotId: string): void {
  db.transaction(() => {
    db.prepare('UPDATE cfr_bean_lots SET is_active = 0').run();
    const result = db.prepare('UPDATE cfr_bean_lots SET is_active = 1 WHERE id = ?').run(lotId);
    if (result.changes === 0) {
      throw new Error(`Bean lot "${lotId}" not found`);
    }
  })();
}

/**
 * Deducts coffee weight from a bean lot.
 */
export function deductBeanLotWeight(db: Database.Database, lotId: string, grams: number): number {
  if (grams <= 0) return 0;
  const current = db.prepare('SELECT remaining_weight_g FROM cfr_bean_lots WHERE id = ?').get(lotId) as
    | { remaining_weight_g: number }
    | undefined;

  if (!current) return 0;
  const updatedWeight = Math.max(0, Math.round((current.remaining_weight_g - grams) * 100) / 100);
  db.prepare('UPDATE cfr_bean_lots SET remaining_weight_g = ? WHERE id = ?').run(updatedWeight, lotId);
  return updatedWeight;
}

/**
 * Seeds standard coffee lots and commercial grinder for initial setup.
 */
export function seedStandardCoffeeSetup(db: Database.Database): void {
  // 1. Seed bean lots if empty
  const lotCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_bean_lots').get() as { count: number }).count;
  if (lotCount === 0) {
    const today = new Date();
    
    // Lot 1: Roasted 12 days ago (Peak Flavor!)
    const peakDate = new Date(today);
    peakDate.setDate(today.getDate() - 12);
    const peakDateStr = formatLocalDateString(peakDate);

    // Lot 2: Roasted 3 days ago (Degassing window!)
    const degasDate = new Date(today);
    degasDate.setDate(today.getDate() - 3);
    const degasDateStr = formatLocalDateString(degasDate);

    const now = today.toISOString();

    db.transaction(() => {
      // Primary Hopper
      db.prepare(`
        INSERT INTO cfr_bean_lots (
          id, roaster_name, lot_name, origin, process, roast_date,
          initial_weight_g, remaining_weight_g, degas_days, peak_days, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'lot_subko_project_x',
        'Subko Specialty Roasters',
        'Project X Specialty Reserve (Lot #24B)',
        'Ratnagiri Estate, Bababudangiri, Karnataka',
        'Anaerobic Slow Dry',
        peakDateStr,
        5000,
        4640,
        7,
        28,
        1,
        now,
      );

      // Degassing Shelf
      db.prepare(`
        INSERT INTO cfr_bean_lots (
          id, roaster_name, lot_name, origin, process, roast_date,
          initial_weight_g, remaining_weight_g, degas_days, peak_days, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'lot_bt_attikan_fresh',
        'Blue Tokai Coffee Roasters',
        'Attikan Estate Signature Espresso',
        'Biligirirangana Hills, Karnataka',
        'Washed',
        degasDateStr,
        10000,
        10000,
        7,
        28,
        0,
        now,
      );
    })();

    console.log('[CFR Coffee] Successfully seeded initial specialty coffee bean lots.');
  }

  // 2. Seed commercial grinder if empty
  const grinderCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_grinders').get() as { count: number }).count;
  if (grinderCount === 0) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO cfr_grinders (
        id, name, model, burr_type, burr_capacity_kg, cumulative_ground_g, last_burr_replacement, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'grinder_mahlkonig_e65s',
      'Espresso Bar Primary Grinder',
      'Mahlkönig E65S GbW (Grind-by-Weight)',
      '65mm Special Hardened Steel Flat Burrs',
      500.0,
      42500.0, // 42.5 kg ground (8.5% wear)
      null,
      now,
      now,
    );

    console.log('[CFR Coffee] Successfully seeded primary commercial espresso grinder.');
  }
}
