/**
 * CFR OS: Specialty Coffee Freshness & Dial-in Types
 * Scientific espresso calibration, roast degassing curves, and grinder burr wear tracking.
 */

export type CfrFreshnessStage = 'DEGASSING' | 'PEAK' | 'FADING' | 'STALE';

export type CfrCoffeeProcess = 'Washed' | 'Natural' | 'Honey' | 'Anaerobic Slow Dry' | 'Monsooned';

export interface CfrFreshnessStatus {
  stage: CfrFreshnessStage;
  days_off_roast: number;
  degas_days: number;
  peak_days: number;
  label: string;
  badge_color: 'amber' | 'emerald' | 'orange' | 'rose';
  guidance: string;
}

export interface CfrBeanLot {
  id: string;
  roaster_name: string;
  lot_name: string;
  origin: string;
  process: CfrCoffeeProcess | string;
  roast_date: string; // YYYY-MM-DD
  initial_weight_g: number;
  remaining_weight_g: number;
  degas_days: number;
  peak_days: number;
  is_active: number; // 1 = currently mounted on primary espresso grinder
  created_at: string;
  // Hydrated fields
  freshness?: CfrFreshnessStatus;
}

export interface CfrDialInRecord {
  id: string;
  bean_lot_id: string;
  dose_grams: number;
  yield_grams: number;
  time_seconds: number;
  grind_setting: string;
  waste_grams: number;
  tasting_notes: string | null;
  barista_name: string | null;
  created_at: string;
  // Computed analytical ratios
  ratio?: number; // e.g. 1 : 2.05
  flow_rate_gps?: number; // liquid grams per second, e.g. 1.36 g/s
  bean_name?: string;
  roaster_name?: string;
}

export type CfrBurrStatus = 'GOOD' | 'INSPECTION_DUE' | 'REPLACEMENT_REQUIRED';

export interface CfrGrinder {
  id: string;
  name: string;
  model: string;
  burr_type: string;
  burr_capacity_kg: number;
  cumulative_ground_g: number;
  last_burr_replacement: string | null;
  created_at: string;
  updated_at: string;
  // Computed lifespan properties
  cumulative_ground_kg?: number;
  wear_percentage?: number;
  remaining_capacity_kg?: number;
  status?: CfrBurrStatus;
}
