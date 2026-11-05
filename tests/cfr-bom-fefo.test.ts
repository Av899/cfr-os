/**
 * CFR OS: Week 4 Automated Verification Suite
 * Gram-Level BOM & FEFO (First-Expiry-First-Out) Inventory Engine
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCfrMigrations } from '../main/cfr/db/migrator';
import {
  receiveStockLot,
  allocateFefoStock,
  reverseOrderFefoStock,
  recordWaste,
  getInventoryStockLevels,
} from '../main/cfr/inventory/fefo';
import {
  resolveRecipeLeafIngredients,
  resolveOrderItemIngredients,
  deductOrderBOM,
  reverseOrderBOM,
  seedStandardCfrRecipes,
} from '../main/cfr/inventory/bom';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`   ✓ ${description}`);
    passed++;
  } else {
    console.error(`   ✗ ${description}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function runTests() {
  console.log('===============================================================');
  console.log('CFR OS: Gram-Level BOM & FEFO Inventory Engine Test Suite');
  console.log('===============================================================\n');

  const tempDbPath = path.join(os.tmpdir(), `cfr-bom-fefo-test-${Date.now()}.db`);
  const db = new Database(tempDbPath);

  try {
    // ── 1. Setup & Migration ────────────────────────────────────────────────
    console.log('Test Suite 1: Schema Initialization & Standard Seeds');
    runCfrMigrations(db);

    const ingCount = (
      db.prepare('SELECT COUNT(*) as c FROM cfr_ingredients').get() as { c: number }
    ).c;
    assert('CFR 100% vegetarian staple ingredients seeded', ingCount >= 10, `Found ${ingCount}`);

    const recipeCount = (
      db.prepare('SELECT COUNT(*) as c FROM cfr_recipes').get() as { c: number }
    ).c;
    assert('Standard CFR recipes & sub-recipes seeded', recipeCount >= 10, `Found ${recipeCount}`);

    // ── 2. FEFO Ordering Test (Earliest Expiry First) ────────────────────────
    console.log('\nTest Suite 2: FEFO Lot Allocation (Earliest Expiry First)');
    // Receive Lot A: 500g expiring 2026-11-20
    const lotA = receiveStockLot(db, {
      ingredient_id: 'ing_beans_bt_attikan',
      batch_no: 'BATCH-A-LATER',
      expiry_date: '2026-11-20',
      initial_qty: 500,
      unit_cost_paise: 250, // ₹2.50 per gram
    });

    // Receive Lot B: 500g expiring 2026-11-10 (Expires SOONER)
    const lotB = receiveStockLot(db, {
      ingredient_id: 'ing_beans_bt_attikan',
      batch_no: 'BATCH-B-SOONER',
      expiry_date: '2026-11-10',
      initial_qty: 500,
      unit_cost_paise: 240, // ₹2.40 per gram
    });

    assert('Lot A created with 500g', lotA.remaining_qty === 500);
    assert('Lot B created with 500g', lotB.remaining_qty === 500);

    // Deduct 100g -> FEFO MUST pick Lot B because 2026-11-10 < 2026-11-20
    const alloc1 = allocateFefoStock(
      db,
      'ing_beans_bt_attikan',
      100,
      'DEDUCTION_ORDER',
      'ORDER_FIRE',
      'ord-101',
    );

    assert('FEFO allocated from single lot', alloc1.allocations.length === 1);
    assert('FEFO correctly prioritized earlier expiry Lot B', alloc1.allocations[0].lot_id === lotB.id);
    assert('Deducted exactly 100g from Lot B', alloc1.allocations[0].qty_deducted === 100);

    const lotBAfter = db.prepare('SELECT remaining_qty FROM cfr_stock_lots WHERE id = ?').get(lotB.id) as any;
    const lotAAfter = db.prepare('SELECT remaining_qty FROM cfr_stock_lots WHERE id = ?').get(lotA.id) as any;
    assert('Lot B remaining is 400g', lotBAfter.remaining_qty === 400);
    assert('Lot A remaining untouched at 500g', lotAAfter.remaining_qty === 500);

    // ── 3. FEFO Cascade / Lot Splitting ────────────────────────────────────
    console.log('\nTest Suite 3: FEFO Cascade / Multi-Lot Splitting');
    // Deduct 450g: Needs 400g from Lot B (depleting it to 0) + 50g from Lot A
    const alloc2 = allocateFefoStock(
      db,
      'ing_beans_bt_attikan',
      450,
      'DEDUCTION_ORDER',
      'ORDER_FIRE',
      'ord-102',
    );

    assert('Allocation spanned across 2 lots', alloc2.allocations.length === 2);
    assert('Depleted remaining 400g of Lot B', alloc2.allocations[0].lot_id === lotB.id && alloc2.allocations[0].qty_deducted === 400);
    assert('Cascaded remaining 50g to Lot A', alloc2.allocations[1].lot_id === lotA.id && alloc2.allocations[1].qty_deducted === 50);

    const lotBFinal = db.prepare('SELECT remaining_qty FROM cfr_stock_lots WHERE id = ?').get(lotB.id) as any;
    const lotAFinal = db.prepare('SELECT remaining_qty FROM cfr_stock_lots WHERE id = ?').get(lotA.id) as any;
    assert('Lot B is completely exhausted (0g)', lotBFinal.remaining_qty === 0);
    assert('Lot A has 450g remaining', lotAFinal.remaining_qty === 450);

    // ── 4. Sub-Recipe Expansion Test ───────────────────────────────────────
    console.log('\nTest Suite 4: Multi-Level Sub-Recipe BOM Resolution');
    // 2 Artisanal Pistachio Croissants:
    // Sub-recipe Plain Croissant (scaled from 10-pc Dough Batch: 60g flour, 35g butter, 8g sugar) + 30g Pistachio paste
    const pistachioIngredients = resolveOrderItemIngredients(db, {
      product_name: 'Artisanal Pistachio Croissant',
      quantity: 2,
    });

    const flour = pistachioIngredients.get('ing_flour_t55_french');
    const butter = pistachioIngredients.get('ing_butter_cultured_84');
    const sugar = pistachioIngredients.get('ing_sugar_cane_raw');
    const pistachio = pistachioIngredients.get('ing_paste_pistachio_pure');

    assert('Resolved flour: 120g (60g * 2)', flour?.quantity === 120 && flour.unit === 'g');
    assert('Resolved butter: 70g (35g * 2)', butter?.quantity === 70 && butter.unit === 'g');
    assert('Resolved sugar: 16g (8g * 2)', sugar?.quantity === 16 && sugar.unit === 'g');
    assert('Resolved pistachio paste: 60g (30g * 2)', pistachio?.quantity === 60 && pistachio.unit === 'g');

    // ── 5. Addon Modifier Substitution (Oat Milk Swap) ────────────────────
    console.log('\nTest Suite 5: Addon Modifiers & Ingredient Substitution');
    // Flat White with Oat Milk Addon:
    // Should deduct 18g Beans + 180ml Oatly Barista (NOT A2 whole cow milk)
    const oatFlatWhiteIngredients = resolveOrderItemIngredients(db, {
      product_name: 'Flat White',
      quantity: 1,
      addons: [{ name: 'Oat Milk Swap', quantity: 1 }],
    });

    const fwBeans = oatFlatWhiteIngredients.get('ing_beans_bt_attikan');
    const fwDairy = oatFlatWhiteIngredients.get('ing_milk_a2_whole');
    const fwOat = oatFlatWhiteIngredients.get('ing_milk_oatly_barista');

    assert('Deducts 18g coffee beans', fwBeans?.quantity === 18);
    assert('Dairy milk is completely substituted (undefined)', fwDairy === undefined);
    assert('Substituted with 180ml Oatly Oat Milk', fwOat?.quantity === 180 && fwOat.unit === 'ml');

    // Extra Shot Addon (+18g espresso beans)
    const extraShotOrder = resolveOrderItemIngredients(db, {
      product_name: 'Flat White',
      quantity: 1,
      addons: [{ name: 'Extra Shot', quantity: 1 }],
    });
    const doubleShotBeans = extraShotOrder.get('ing_beans_bt_attikan');
    assert('Extra shot adds +18g beans (total 36g)', doubleShotBeans?.quantity === 36);

    // ── 6. Order BOM Deduction & Reversal Lifecycle ───────────────────────
    console.log('\nTest Suite 6: Order BOM Deduction & Reversal Lifecycle');
    // Receive milk lot: 1,000ml expiring 2026-11-12
    const milkLot = receiveStockLot(db, {
      ingredient_id: 'ing_milk_a2_whole',
      batch_no: 'MILK-LOT-1',
      expiry_date: '2026-11-12',
      initial_qty: 1000,
      unit_cost_paise: 8, // 8 paise per ml = ₹80/liter
    });

    const orderDeduction = deductOrderBOM(db, 'ord-999', [
      { product_name: 'Flat White', quantity: 2 }, // 36g beans + 360ml milk
    ]);

    assert('Deducted 2 ingredients for order', orderDeduction.ingredients.length === 2);
    const beansDeducted = orderDeduction.ingredients.find((i) => i.ingredient_id === 'ing_beans_bt_attikan');
    const milkDeducted = orderDeduction.ingredients.find((i) => i.ingredient_id === 'ing_milk_a2_whole');
    assert('Deducted 36g beans for 2 Flat Whites', beansDeducted?.total_qty === 36);
    assert('Deducted 360ml milk for 2 Flat Whites', milkDeducted?.total_qty === 360);

    const lotABeforeCancel = db.prepare('SELECT remaining_qty FROM cfr_stock_lots WHERE id = ?').get(lotA.id) as any;
    const milkLotBeforeCancel = db.prepare('SELECT remaining_qty FROM cfr_stock_lots WHERE id = ?').get(milkLot.id) as any;
    assert('Lot A beans decreased to 414g (450 - 36)', lotABeforeCancel.remaining_qty === 414);
    assert('Milk lot decreased to 640ml (1000 - 360)', milkLotBeforeCancel.remaining_qty === 640);

    // Now Cancel Order ord-999: verify reversal restores exact stock!
    const reversal = reverseOrderBOM(db, 'ord-999');
    assert('Reversed order movements', reversal.reversedCount === 2);

    const lotAAfterCancel = db.prepare('SELECT remaining_qty FROM cfr_stock_lots WHERE id = ?').get(lotA.id) as any;
    const milkLotAfterCancel = db.prepare('SELECT remaining_qty FROM cfr_stock_lots WHERE id = ?').get(milkLot.id) as any;
    assert('Lot A beans restored to 450g', lotAAfterCancel.remaining_qty === 450);
    assert('Milk lot restored to 1,000ml', milkLotAfterCancel.remaining_qty === 1000);

    // ── 7. Barista Waste / Dial-In Logging ─────────────────────────────────
    console.log('\nTest Suite 7: Barista Dial-In Shot & Milk Purge Waste');
    const dialInWaste = recordWaste(db, {
      ingredient_id: 'ing_beans_bt_attikan',
      qty: 18,
      reason: 'DIAL_IN_SHOT',
    });

    assert('Dial-in shot waste recorded', dialInWaste.allocations.length === 1);
    assert('Deducted 18g beans for dial-in shot', dialInWaste.allocations[0].qty_deducted === 18);

    const wasteMovement = db
      .prepare("SELECT * FROM cfr_stock_movements WHERE type = 'WASTE' AND reason = 'DIAL_IN_SHOT'")
      .get() as any;
    assert('Waste movement logged with reason DIAL_IN_SHOT', wasteMovement !== undefined && wasteMovement.qty === 18);

    // ── 8. Inventory Stock Levels & Low Stock Par Warnings ─────────────────
    console.log('\nTest Suite 8: Inventory Stock Levels & Par Warnings');
    const stockSummary = getInventoryStockLevels(db, 'ing_beans_bt_attikan');
    assert('Stock summary returned 1 ingredient', stockSummary.length === 1);
    assert('Remaining beans stock is 432g (450 - 18 waste)', stockSummary[0].current_stock === 432);
    assert('Par warning triggered (432g < 5000g par)', stockSummary[0].is_low_stock === true);
    assert('Earliest expiry matches Lot A (2026-11-20)', stockSummary[0].earliest_expiry === '2026-11-20');

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\n===============================================================');
    console.log(`Summary: ${passed + failed} checks | Passed: ${passed} | Failed: ${failed}`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    db.close();
    try {
      fs.unlinkSync(tempDbPath);
      const wal = `${tempDbPath}-wal`;
      const shm = `${tempDbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch {}
  }
}

runTests();
