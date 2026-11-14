/**
 * CFR OS: Commercial Grinder Burr Wear & Lifespan Tracker
 * Monitors cumulative coffee ground vs. manufacturer burr ratings (e.g. 500 kg).
 */

import type Database from 'better-sqlite3';
import { CfrBurrStatus, CfrGrinder } from '../types/coffee';

export class GrinderNotFoundError extends Error {
  constructor(grinderId: string) {
    super(`Grinder "${grinderId}" not found in database.`);
    this.name = 'GrinderNotFoundError';
  }
}

/**
 * Calculates grinder wear metrics, status alerts, and remaining capacity.
 */
export function hydrateGrinder(raw: any): CfrGrinder {
  const cumulativeGroundG = Number(raw.cumulative_ground_g || 0);
  const burrCapacityKg = Number(raw.burr_capacity_kg || 500);
  const cumulativeGroundKg = Math.round((cumulativeGroundG / 1000) * 10) / 10;
  const wearPercentage = Math.min(100, Math.round((cumulativeGroundKg / burrCapacityKg) * 1000) / 10);
  const remainingCapacityKg = Math.max(0, Math.round((burrCapacityKg - cumulativeGroundKg) * 10) / 10);

  let status: CfrBurrStatus = 'GOOD';
  if (wearPercentage >= 100) {
    status = 'REPLACEMENT_REQUIRED';
  } else if (wearPercentage >= 80) {
    status = 'INSPECTION_DUE';
  }

  return {
    id: raw.id,
    name: raw.name,
    model: raw.model,
    burr_type: raw.burr_type,
    burr_capacity_kg: burrCapacityKg,
    cumulative_ground_g: cumulativeGroundG,
    last_burr_replacement: raw.last_burr_replacement,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    cumulative_ground_kg: cumulativeGroundKg,
    wear_percentage: wearPercentage,
    remaining_capacity_kg: remainingCapacityKg,
    status,
  };
}

/**
 * Retrieves the primary espresso grinder and wear metrics.
 */
export function getPrimaryGrinder(db: Database.Database, grinderId = 'grinder_mahlkonig_e65s'): CfrGrinder {
  let row = db.prepare('SELECT * FROM cfr_grinders WHERE id = ?').get(grinderId);
  if (!row) {
    // Fall back to first registered grinder
    row = db.prepare('SELECT * FROM cfr_grinders ORDER BY created_at ASC LIMIT 1').get();
  }
  if (!row) {
    throw new GrinderNotFoundError(grinderId);
  }
  return hydrateGrinder(row);
}

/**
 * Increments cumulative coffee ground in grams for a grinder.
 */
export function recordGrindUsage(
  db: Database.Database,
  grinderId: string,
  gramsGround: number,
): CfrGrinder {
  if (gramsGround <= 0) {
    return getPrimaryGrinder(db, grinderId);
  }

  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE cfr_grinders
    SET cumulative_ground_g = cumulative_ground_g + ?,
        updated_at = ?
    WHERE id = ?
  `).run(gramsGround, now, grinderId);

  if (result.changes === 0) {
    throw new GrinderNotFoundError(grinderId);
  }

  return getPrimaryGrinder(db, grinderId);
}

/**
 * Resets cumulative ground grams after a burr replacement or sharpening.
 */
export function resetGrinderBurrs(db: Database.Database, grinderId: string): CfrGrinder {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE cfr_grinders
    SET cumulative_ground_g = 0.0,
        last_burr_replacement = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, grinderId);

  if (result.changes === 0) {
    throw new GrinderNotFoundError(grinderId);
  }

  return getPrimaryGrinder(db, grinderId);
}
