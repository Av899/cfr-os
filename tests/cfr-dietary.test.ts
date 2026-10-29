/**
 * CFR OS: Dietary Invariants & Database Schema Tests
 *
 * Verifies 100% vegetarian & artisanal eggless enforcement at both the
 * service guard layer and SQLite DB CHECK constraint layer.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-dietary.test.ts
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import {
  assertDietarySafe,
  isDietarySafe,
  validateIngredient,
  validateRecipe,
  DietaryViolationError,
} from '../main/cfr/dietary/guard';
import { runCfrMigrations, CFR_STAPLE_INGREDIENTS } from '../main/cfr/db/migrator';

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, message: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertThrows(fn: () => void, expectedCode: string, label: string): void {
  total++;
  try {
    fn();
    failed++;
    console.error(`  ✗ ${label} — expected throw`);
  } catch (err: any) {
    if (err.code === expectedCode || err.name === 'DietaryViolationError' || String(err).includes(expectedCode)) {
      passed++;
      console.log(`  ✓ ${label} (caught expected ${expectedCode})`);
    } else {
      failed++;
      console.error(`  ✗ ${label} — unexpected error: ${err.message || err}`);
    }
  }
}

console.log('\n--- Test Suite 1: Dietary Service Guard Invariants ---');

// 1. Safe items pass
assert(isDietarySafe('VEGAN,EGGLESS'), 'Vegan and eggless flags are recognized as safe');
assert(isDietarySafe('LACTO_VEG,EGGLESS'), 'Lacto-veg and eggless flags are recognized as safe');
assert(isDietarySafe(['VEGAN', 'DAIRY_FREE', 'EGGLESS']), 'Array of safe flags is recognized as safe');
assert(isDietarySafe('EGGLESS_MAYO,AQUAFABA'), 'Eggless substitutes like aquafaba are safe');

// 2. Banned substances fail
assert(!isDietarySafe('CONTAINS_EGG'), 'CONTAINS_EGG is recognized as unsafe');
assert(!isDietarySafe('GELATIN'), 'GELATIN is recognized as unsafe');
assert(!isDietarySafe('ANIMAL_RENNET'), 'ANIMAL_RENNET is recognized as unsafe');
assert(!isDietarySafe('CARMINE'), 'CARMINE is recognized as unsafe');
assert(!isDietarySafe('MEAT_FISH'), 'MEAT_FISH is recognized as unsafe');
assert(!isDietarySafe('LARD'), 'LARD is recognized as unsafe');
assert(!isDietarySafe('EGG_WASH'), 'Egg wash is recognized as unsafe');

// 3. assertDietarySafe throws DietaryViolationError
assertThrows(
  () => assertDietarySafe('CONTAINS_EGG', 'Brioche Dough'),
  'ERR_CFR_DIETARY_VIOLATION',
  'Throws on CONTAINS_EGG'
);

assertThrows(
  () => assertDietarySafe('GELATIN', 'Panna Cotta'),
  'ERR_CFR_DIETARY_VIOLATION',
  'Throws on GELATIN'
);

assertThrows(
  () => assertDietarySafe('ANIMAL_RENNET', 'Parmesan Cheese'),
  'ERR_CFR_DIETARY_VIOLATION',
  'Throws on ANIMAL_RENNET'
);

// 4. validateIngredient & validateRecipe
assertThrows(
  () =>
    validateIngredient({
      name: 'Standard Pastry Cream',
      dietary_flags: 'LACTO_VEG,CONTAINS_EGG',
    }),
  'ERR_CFR_DIETARY_VIOLATION',
  'validateIngredient rejects egg in pastry cream'
);

assertThrows(
  () =>
    validateRecipe('Classic Tiramisu', [
      { name: 'Mascarpone', dietary_flags: 'LACTO_VEG,EGGLESS' },
      { name: 'Ladyfingers with Egg', dietary_flags: 'CONTAINS_EGG' },
      { name: 'Espresso', dietary_flags: 'VEGAN,EGGLESS' },
    ]),
  'ERR_CFR_DIETARY_VIOLATION',
  'validateRecipe rejects recipe containing any non-eggless component'
);

console.log('\n--- Test Suite 2: SQLite Schema & CHECK Constraint Invariants ---');

// Use an in-memory test database
const testDb = new Database(':memory:');

// Ensure foreign keys are enabled
testDb.pragma('foreign_keys = ON');

// Run CFR Migrations on test database
runCfrMigrations(testDb);

// Check that tables were created
const tables = testDb
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cfr_%'")
  .all() as { name: string }[];

const tableNames = tables.map((t) => t.name);
assert(tableNames.includes('cfr_meta'), 'cfr_meta table created');
assert(tableNames.includes('cfr_ingredients'), 'cfr_ingredients table created');
assert(tableNames.includes('cfr_recipes'), 'cfr_recipes table created');
assert(tableNames.includes('cfr_recipe_items'), 'cfr_recipe_items table created');
assert(tableNames.includes('cfr_stock_lots'), 'cfr_stock_lots table created');
assert(tableNames.includes('cfr_stock_movements'), 'cfr_stock_movements table created');
assert(tableNames.includes('cfr_invoices'), 'cfr_invoices table created');
assert(tableNames.includes('cfr_credit_notes'), 'cfr_credit_notes table created');
assert(tableNames.includes('cfr_bean_lots'), 'cfr_bean_lots table created');
assert(tableNames.includes('cfr_dial_in_logs'), 'cfr_dial_in_logs table created');

// Check that staple ingredients were seeded
const seededCount = (
  testDb.prepare('SELECT COUNT(*) as count FROM cfr_ingredients').get() as { count: number }
).count;
assert(
  seededCount === CFR_STAPLE_INGREDIENTS.length,
  `Seeded ${seededCount} staple ingredients (expected ${CFR_STAPLE_INGREDIENTS.length})`
);

// Verify ALL seeded items pass the dietary guard
for (const item of CFR_STAPLE_INGREDIENTS) {
  assert(
    isDietarySafe(item.dietary_flags),
    `Seeded item "${item.name}" passes 100% vegetarian & eggless guard`
  );
}

// Verify Database CHECK constraint physically blocks raw SQL insert with banned flags
assertThrows(
  () => {
    testDb
      .prepare(`
        INSERT INTO cfr_ingredients (
          id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags, created_at, updated_at
        ) VALUES ('illegal_egg', 'Egg Wash', 'dairy', 'ml', 10, 0, 'LACTO_VEG,CONTAINS_EGG', '2026-01-01', '2026-01-01')
      `)
      .run();
  },
  'CHECK constraint failed',
  'SQLite CHECK constraint blocks raw SQL insert with CONTAINS_EGG'
);

assertThrows(
  () => {
    testDb
      .prepare(`
        INSERT INTO cfr_ingredients (
          id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags, created_at, updated_at
        ) VALUES ('illegal_gelatin', 'Bovine Gelatin Sheets', 'dry_good', 'piece', 50, 0, 'GELATIN', '2026-01-01', '2026-01-01')
      `)
      .run();
  },
  'CHECK constraint failed',
  'SQLite CHECK constraint blocks raw SQL insert with GELATIN'
);

testDb.close();

console.log(`\nResults: ${passed} passed, ${failed} failed, ${total} total assertions.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All Week 1 Dietary & Database invariants PASSED cleanly!\n');
}
