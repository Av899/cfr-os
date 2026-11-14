/**
 * CFR OS: Database Migrator & Seed Runner
 *
 * Runs custom CFR database schema migrations and initial 100% vegetarian &
 * eggless seed verification without altering FloCafe's core migrations.
 */

import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { validateIngredient } from '../dietary/guard';
import { CfrIngredient } from '../types/dietary';

const CFR_SCHEMA_VERSION = 1;

export const CFR_SCHEMA_SQL = `
-- Metadata and schema version tracking
CREATE TABLE IF NOT EXISTS cfr_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Ingredients with strict 100% vegetarian & eggless DB-level check
CREATE TABLE IF NOT EXISTS cfr_ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  base_unit TEXT NOT NULL CHECK (base_unit IN ('g', 'ml', 'piece')),
  cost_per_unit_paise INTEGER NOT NULL DEFAULT 0,
  par_level REAL NOT NULL DEFAULT 0,
  dietary_flags TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    dietary_flags NOT LIKE '%CONTAINS_EGG%' AND
    dietary_flags NOT LIKE '%GELATIN%' AND
    dietary_flags NOT LIKE '%ANIMAL_RENNET%' AND
    dietary_flags NOT LIKE '%CARMINE%' AND
    dietary_flags NOT LIKE '%MEAT_FISH%' AND
    dietary_flags NOT LIKE '%LARD%' AND
    dietary_flags NOT LIKE '%ISINGLASS%'
  )
);

CREATE INDEX IF NOT EXISTS idx_cfr_ingredients_category ON cfr_ingredients(category);

-- Recipes (Product BOMs and Sub-Recipes like Croissant Dough Batch)
CREATE TABLE IF NOT EXISTS cfr_recipes (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  name TEXT NOT NULL,
  yield_quantity REAL NOT NULL DEFAULT 1,
  yield_unit TEXT NOT NULL DEFAULT 'serving',
  is_sub_recipe INTEGER NOT NULL DEFAULT 0 CHECK (is_sub_recipe IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfr_recipes_product ON cfr_recipes(product_id);

-- Recipe Line Items (Quantity in grams / ml / pieces)
CREATE TABLE IF NOT EXISTS cfr_recipe_items (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES cfr_recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES cfr_ingredients(id),
  sub_recipe_id TEXT REFERENCES cfr_recipes(id),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  CHECK (
    (ingredient_id IS NOT NULL AND sub_recipe_id IS NULL) OR
    (ingredient_id IS NULL AND sub_recipe_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cfr_recipe_items_recipe ON cfr_recipe_items(recipe_id);

-- Stock Lots for FEFO (First-Expiry-First-Out) Inventory Tracking
CREATE TABLE IF NOT EXISTS cfr_stock_lots (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES cfr_ingredients(id),
  batch_no TEXT NOT NULL,
  supplier_name TEXT,
  received_at TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  initial_qty REAL NOT NULL,
  remaining_qty REAL NOT NULL,
  unit_cost_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfr_stock_lots_fefo ON cfr_stock_lots(ingredient_id, expiry_date, remaining_qty);

-- Stock Movement Audit Ledger
CREATE TABLE IF NOT EXISTS cfr_stock_movements (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES cfr_ingredients(id),
  lot_id TEXT REFERENCES cfr_stock_lots(id),
  type TEXT NOT NULL CHECK (type IN ('PURCHASE', 'DEDUCTION_ORDER', 'DEDUCTION_BATCH', 'WASTE', 'ADJUSTMENT', 'REVERSAL')),
  qty REAL NOT NULL,
  reason TEXT,
  order_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfr_stock_movements_ing ON cfr_stock_movements(ingredient_id, created_at);

-- Gap-free Financial Year GST Invoices (Haryana 5% GST split: 2.5% CGST + 2.5% SGST)
CREATE TABLE IF NOT EXISTS cfr_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  fy TEXT NOT NULL,
  taxable_paise INTEGER NOT NULL,
  cgst_paise INTEGER NOT NULL,
  sgst_paise INTEGER NOT NULL,
  roundoff_paise INTEGER NOT NULL,
  payable_paise INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI_DYNAMIC', 'UPI_MANUAL', 'CASH', 'CARD')),
  payment_ref TEXT,
  status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'VOIDED', 'CREDIT_NOTE_ISSUED')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfr_invoices_order ON cfr_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_cfr_invoices_number ON cfr_invoices(invoice_number);

-- Credit Notes for Voided / Refunded Invoices
CREATE TABLE IF NOT EXISTS cfr_credit_notes (
  id TEXT PRIMARY KEY,
  credit_note_number TEXT NOT NULL UNIQUE,
  original_invoice_id TEXT NOT NULL REFERENCES cfr_invoices(id),
  reason TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Specialty Coffee Bean Lots (Roast Date, Origin, Freshness Window)
CREATE TABLE IF NOT EXISTS cfr_bean_lots (
  id TEXT PRIMARY KEY,
  roaster_name TEXT NOT NULL,
  lot_name TEXT NOT NULL,
  origin TEXT NOT NULL,
  process TEXT NOT NULL DEFAULT 'Washed',
  roast_date TEXT NOT NULL,
  initial_weight_g REAL NOT NULL,
  remaining_weight_g REAL NOT NULL,
  degas_days INTEGER NOT NULL DEFAULT 7,
  peak_days INTEGER NOT NULL DEFAULT 28,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

-- Barista Daily Dial-in Logs
CREATE TABLE IF NOT EXISTS cfr_dial_in_logs (
  id TEXT PRIMARY KEY,
  bean_lot_id TEXT NOT NULL REFERENCES cfr_bean_lots(id),
  dose_grams REAL NOT NULL,
  yield_grams REAL NOT NULL,
  time_seconds REAL NOT NULL,
  grind_setting TEXT NOT NULL,
  waste_grams REAL NOT NULL DEFAULT 0,
  tasting_notes TEXT,
  barista_name TEXT,
  created_at TEXT NOT NULL
);

-- Commercial Espresso Grinders & Burr Lifespan Tracker
CREATE TABLE IF NOT EXISTS cfr_grinders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  burr_type TEXT NOT NULL,
  burr_capacity_kg REAL NOT NULL DEFAULT 500.0,
  cumulative_ground_g REAL NOT NULL DEFAULT 0.0,
  last_burr_replacement TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- UPI and Dual-Track Payment Reconciliations
CREATE TABLE IF NOT EXISTS cfr_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  invoice_id TEXT,
  method TEXT NOT NULL CHECK (method IN ('UPI_DYNAMIC', 'UPI_MANUAL', 'CASH', 'CARD')),
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_RECONCILIATION' CHECK (status IN ('PENDING_RECONCILIATION', 'CONFIRMED', 'FAILED')),
  upi_uri TEXT,
  utr_ref TEXT,
  gateway_payment_id TEXT,
  reconciled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfr_payments_order ON cfr_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_cfr_payments_status ON cfr_payments(status);

-- Public Luxury Digital Menu Sections
CREATE TABLE IF NOT EXISTS cfr_menu_sections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Public Luxury Digital Menu Items
CREATE TABLE IF NOT EXISTS cfr_menu_items (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES cfr_menu_sections(id),
  product_id TEXT,
  name TEXT NOT NULL,
  tagline TEXT,
  price_paise INTEGER NOT NULL CHECK (price_paise % 1000 = 0),
  description TEXT NOT NULL,
  tasting_notes TEXT NOT NULL,
  craft_story TEXT NOT NULL,
  origin TEXT,
  dietary_flags TEXT NOT NULL DEFAULT 'VEGAN,EGGLESS' CHECK (
    dietary_flags NOT LIKE '%CONTAINS_EGG%' AND
    dietary_flags NOT LIKE '%GELATIN%' AND
    dietary_flags NOT LIKE '%ANIMAL_RENNET%' AND
    dietary_flags NOT LIKE '%CARMINE%' AND
    dietary_flags NOT LIKE '%MEAT_FISH%' AND
    dietary_flags NOT LIKE '%LARD%'
  ),
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  calories INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cfr_menu_items_section ON cfr_menu_items(section_id);

-- Commercial Equipment Cleaning & Maintenance Tasks
CREATE TABLE IF NOT EXISTS cfr_equipment_tasks (
  id TEXT PRIMARY KEY,
  equipment_type TEXT NOT NULL,
  equipment_name TEXT NOT NULL,
  task_name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'DAILY_OPEN',
  instructions TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
  last_completed_at TEXT,
  completed_by TEXT
);

-- Server Wrist Pager & Notification Logs
CREATE TABLE IF NOT EXISTS cfr_pager_logs (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  table_number TEXT,
  server_name TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'ACKNOWLEDGED')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfr_pager_logs_created ON cfr_pager_logs(created_at);
`;

/**
 * Initial 100% Vegetarian & Artisanal Eggless Staple Ingredients for CFR Coffee
 */
export const CFR_STAPLE_INGREDIENTS: Omit<CfrIngredient, 'created_at' | 'updated_at'>[] = [
  {
    id: 'ing_beans_bt_attikan',
    name: 'Blue Tokai Attikan Estate Coffee Beans',
    category: 'coffee_beans',
    base_unit: 'g',
    cost_per_unit_paise: 250, // ₹2.50 per gram (₹2,500/kg)
    par_level: 5000,
    dietary_flags: 'VEGAN,EGGLESS',
  },
  {
    id: 'ing_beans_subko_lot',
    name: 'Subko Specialty Reserve Beans',
    category: 'coffee_beans',
    base_unit: 'g',
    cost_per_unit_paise: 320, // ₹3.20 per gram
    par_level: 3000,
    dietary_flags: 'VEGAN,EGGLESS',
  },
  {
    id: 'ing_milk_a2_whole',
    name: 'Local Fresh A2 Whole Cow Milk',
    category: 'dairy',
    base_unit: 'ml',
    cost_per_unit_paise: 9, // ₹0.09 per ml (₹90/litre)
    par_level: 30000,
    dietary_flags: 'LACTO_VEG,EGGLESS',
  },
  {
    id: 'ing_milk_oatly_barista',
    name: 'Oatly Barista Edition Oat Milk',
    category: 'plant_milk',
    base_unit: 'ml',
    cost_per_unit_paise: 35, // ₹0.35 per ml (₹350/litre)
    par_level: 10000,
    dietary_flags: 'VEGAN,EGGLESS,DAIRY_FREE',
  },
  {
    id: 'ing_butter_cultured_84',
    name: 'Normandy Style 84% Cultured Butter',
    category: 'fat_butter',
    base_unit: 'g',
    cost_per_unit_paise: 120, // ₹1.20 per gram (₹1,200/kg)
    par_level: 15000,
    dietary_flags: 'LACTO_VEG,EGGLESS',
  },
  {
    id: 'ing_flour_t55_french',
    name: 'Imported T55 French Patisserie Flour',
    category: 'flour',
    base_unit: 'g',
    cost_per_unit_paise: 22, // ₹0.22 per gram (₹220/kg)
    par_level: 50000,
    dietary_flags: 'VEGAN,EGGLESS',
  },
  {
    id: 'ing_paste_pistachio_pure',
    name: '100% Bronte Pure Pistachio Paste',
    category: 'nuts_pastes',
    base_unit: 'g',
    cost_per_unit_paise: 450, // ₹4.50 per gram
    par_level: 2000,
    dietary_flags: 'VEGAN,EGGLESS',
  },
  {
    id: 'ing_cocoa_valrhona_70',
    name: 'Valrhona Guanaja 70% Dark Chocolate',
    category: 'chocolate_cocoa',
    base_unit: 'g',
    cost_per_unit_paise: 280, // ₹2.80 per gram
    par_level: 4000,
    dietary_flags: 'VEGAN,EGGLESS',
  },
  {
    id: 'ing_substitute_aquafaba',
    name: 'Artisanal Reduced Chickpea Aquafaba',
    category: 'sweetener',
    base_unit: 'ml',
    cost_per_unit_paise: 8,
    par_level: 5000,
    dietary_flags: 'VEGAN,EGGLESS',
  },
  {
    id: 'ing_sugar_cane_raw',
    name: 'Khandsari Unrefined Raw Cane Sugar',
    category: 'sweetener',
    base_unit: 'g',
    cost_per_unit_paise: 12,
    par_level: 25000,
    dietary_flags: 'VEGAN,EGGLESS',
  },
];

/**
 * Executes CFR database schema migrations and verifies dietary invariants.
 */
export function runCfrMigrations(db: Database.Database): void {
  const logPrefix = '[CFR DB]';

  // 1. Execute schema SQL
  db.exec(CFR_SCHEMA_SQL);

  // 2. Check and record version
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO cfr_meta (key, value, updated_at)
    VALUES ('schema_version', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(String(CFR_SCHEMA_VERSION), now);

  // 3. Seed staple ingredients if not present, enforcing dietary guard
  const existingCount = (
    db.prepare('SELECT COUNT(*) as count FROM cfr_ingredients').get() as { count: number }
  )?.count || 0;

  if (existingCount === 0) {
    console.log(`${logPrefix} Seeding initial 100% vegetarian & artisanal eggless staple ingredients...`);

    const insertStmt = db.prepare(`
      INSERT INTO cfr_ingredients (
        id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const ingredient of CFR_STAPLE_INGREDIENTS) {
        // Enforce the dietary guard before DB write
        validateIngredient(ingredient);

        insertStmt.run(
          ingredient.id,
          ingredient.name,
          ingredient.category,
          ingredient.base_unit,
          ingredient.cost_per_unit_paise,
          ingredient.par_level,
          ingredient.dietary_flags,
          now,
          now
        );
      }
    })();

    console.log(`${logPrefix} Successfully seeded ${CFR_STAPLE_INGREDIENTS.length} eggless staple ingredients.`);
  }

  // 4. Seed standard CFR recipes & sub-recipes if empty
  try {
    const { seedStandardCfrRecipes } = require('../inventory/bom');
    seedStandardCfrRecipes(db);
  } catch (err: any) {
    console.error('[CFR DB] Failed to seed recipes:', err?.message || err);
  }

  // 5. Seed standard CFR specialty coffee bean lots & grinder if empty
  try {
    const { seedStandardCoffeeSetup } = require('../coffee/bean-lots');
    seedStandardCoffeeSetup(db);
  } catch (err: any) {
    console.error('[CFR DB] Failed to seed coffee setup:', err?.message || err);
  }

  // 6. Seed standard CFR digital menu & equipment checklists if empty
  try {
    const { seedStandardMenuAndEquipment } = require('../menu/menu-engine');
    seedStandardMenuAndEquipment(db);
  } catch (err: any) {
    console.error('[CFR DB] Failed to seed menu and equipment:', err?.message || err);
  }

  console.log(`${logPrefix} CFR schema v${CFR_SCHEMA_VERSION} initialized successfully.`);
}
