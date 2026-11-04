-- ============================================================================
-- CFR OS: Database Schema (Coffee First Ritual - Karnal)
-- All tables are prefixed with cfr_ to avoid any conflict with upstream FloCafe.
-- ============================================================================

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
  -- Physical DB guard: Reject any banned non-vegetarian substances
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
  product_id TEXT, -- references FloCafe products(id) or NULL if sub-recipe
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
  expiry_date TEXT NOT NULL, -- YYYY-MM-DD for sorted FEFO query
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
  reason TEXT, -- 'ORDER_FIRE', 'DIAL_IN_SHOT', 'MILK_PURGE', 'PAST_EXPIRY', 'STAFF_MEAL', 'SPOILED', 'COUNT_ADJUSTMENT'
  order_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cfr_stock_movements_ing ON cfr_stock_movements(ingredient_id, created_at);

-- Gap-free Financial Year GST Invoices (Haryana 5% GST split: 2.5% CGST + 2.5% SGST)
CREATE TABLE IF NOT EXISTS cfr_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE, -- 'CFR/26-27/000001'
  order_id TEXT NOT NULL,
  fy TEXT NOT NULL, -- '26-27'
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
  credit_note_number TEXT NOT NULL UNIQUE, -- 'CN/26-27/000001'
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
  roast_date TEXT NOT NULL, -- YYYY-MM-DD
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
