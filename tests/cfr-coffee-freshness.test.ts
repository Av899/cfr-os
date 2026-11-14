/**
 * CFR OS: Week 5 Automated Verification Suite
 * Specialty Coffee Freshness, Barista Dial-In Calibration & Burr Wear Engine
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runCfrMigrations } from '../main/cfr/db/migrator';
import {
  calculateDaysOffRoast,
  getFreshnessStatus,
  createBeanLot,
  listBeanLots,
  getActiveBeanLot,
  setActiveBeanLot,
  deductBeanLotWeight,
  formatLocalDateString,
} from '../main/cfr/coffee/bean-lots';
import { receiveStockLot } from '../main/cfr/inventory/fefo';
import {
  hydrateGrinder,
  getPrimaryGrinder,
  recordGrindUsage,
  resetGrinderBurrs,
} from '../main/cfr/coffee/burr-wear';
import {
  logDialIn,
  getLatestDialIn,
  listDialInHistory,
  InvalidDialInParametersError,
} from '../main/cfr/coffee/dial-in';

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
  console.log('========================================================================');
  console.log('CFR OS: Specialty Coffee Freshness & Dial-in Engine Test Suite');
  console.log('========================================================================\n');

  const tempDbPath = path.join(os.tmpdir(), `cfr-coffee-test-${Date.now()}.db`);
  const db = new Database(tempDbPath);

  try {
    // ── 1. Schema Initialization & Standard Seeds ───────────────────────────
    console.log('Test Suite 1: Schema Initialization & Standard Seeds');
    runCfrMigrations(db);

    const lotCount = (
      db.prepare('SELECT COUNT(*) as c FROM cfr_bean_lots').get() as { c: number }
    ).c;
    assert('Standard specialty coffee bean lots seeded', lotCount >= 2, `Found ${lotCount}`);

    const grinderCount = (
      db.prepare('SELECT COUNT(*) as c FROM cfr_grinders').get() as { c: number }
    ).c;
    assert('Commercial grinder seeded (Mahlkönig E65S GbW)', grinderCount >= 1, `Found ${grinderCount}`);

    // ── 2. Specialty Coffee Roast Age & Degassing Curve Calculation ──────────
    console.log('\nTest Suite 2: Roast Age & Degassing Curve Calculation');

    const today = new Date();
    const todayStr = formatLocalDateString(today);

    // Day 0 (Roasted Today)
    const daysToday = calculateDaysOffRoast(todayStr, today);
    assert('Days off roast today equals 0', daysToday === 0, `Got ${daysToday}`);

    // Day 3 (Degassing window)
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    const threeDaysAgoStr = formatLocalDateString(threeDaysAgo);
    const days3 = calculateDaysOffRoast(threeDaysAgoStr, today);
    assert('Days off roast 3 days ago equals 3', days3 === 3, `Got ${days3}`);

    const statusDegas = getFreshnessStatus(days3);
    assert('Day 3 falls in DEGASSING window', statusDegas.stage === 'DEGASSING', `Stage: ${statusDegas.stage}`);
    assert('DEGASSING badge color is amber', statusDegas.badge_color === 'amber');

    // Day 14 (Peak Flavor window)
    const statusPeak = getFreshnessStatus(14);
    assert('Day 14 falls in PEAK flavor window', statusPeak.stage === 'PEAK', `Stage: ${statusPeak.stage}`);
    assert('PEAK badge color is emerald', statusPeak.badge_color === 'emerald');

    // Day 35 (Fading window)
    const statusFading = getFreshnessStatus(35);
    assert('Day 35 falls in FADING window', statusFading.stage === 'FADING', `Stage: ${statusFading.stage}`);
    assert('FADING badge color is orange', statusFading.badge_color === 'orange');

    // Day 60 (Stale window)
    const statusStale = getFreshnessStatus(60);
    assert('Day 60 falls in STALE window (> 45 days)', statusStale.stage === 'STALE', `Stage: ${statusStale.stage}`);
    assert('STALE badge color is rose', statusStale.badge_color === 'rose');

    // ── 3. Bean Lot Creation, Activation & Deductions ─────────────────────────
    console.log('\nTest Suite 3: Bean Lot Creation, Activation & Weight Deductions');

    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(today.getDate() - 10);
    const tenDaysAgoStr = formatLocalDateString(tenDaysAgo);

    const newLot = createBeanLot(db, {
      roaster_name: 'Blue Tokai Coffee Roasters',
      lot_name: 'Attikan Estate - Microlot 14',
      origin: 'Biligirirangana Hills, Karnataka',
      process: 'Washed Arabica',
      roast_date: tenDaysAgoStr,
      weight_g: 2500,
      set_active: true,
    });

    assert('New bean lot created successfully', Boolean(newLot.id));
    assert('Roast age hydrated correctly (10 days)', newLot.freshness.days_off_roast === 10);
    assert('New lot in PEAK flavor window', newLot.freshness.stage === 'PEAK');
    assert('New lot set as active', newLot.is_active === 1);

    const activeLot = getActiveBeanLot(db);
    assert('getActiveBeanLot returns the newly activated lot', activeLot?.id === newLot.id);

    // Deduct 250g from lot
    const remainingAfterDeduct = deductBeanLotWeight(db, newLot.id, 250);
    assert('deductBeanLotWeight correctly reduced weight', remainingAfterDeduct === 2250, `Remaining: ${remainingAfterDeduct}`);

    // ── 4. Barista Morning Dial-in Calibration Logger ────────────────────────
    console.log('\nTest Suite 4: Barista Morning Espresso Dial-In Calibration Logger');

    // Receive a FEFO stock lot for coffee beans so the waste deduction allocates against physical stock
    receiveStockLot(db, {
      ingredient_id: 'ing_beans_bt_attikan',
      batch_no: 'BT-ATTIKAN-CALIB-01',
      expiry_date: '2027-01-01',
      initial_qty: 1000,
      unit_cost_paise: 250,
    });

    // Test parameter validations
    let caughtUnderDose = false;
    try {
      logDialIn(db, {
        bean_lot_id: newLot.id,
        dose_grams: 8.0, // Under 10g
        yield_grams: 38.0,
        time_seconds: 28,
        grind_setting: '2.4',
      });
    } catch (err) {
      if (err instanceof InvalidDialInParametersError) caughtUnderDose = true;
    }
    assert('Rejects dry dose below 10.0g', caughtUnderDose);

    let caughtMissingGrind = false;
    try {
      logDialIn(db, {
        bean_lot_id: newLot.id,
        dose_grams: 18.5,
        yield_grams: 38.0,
        time_seconds: 28,
        grind_setting: '', // Empty grind setting
      });
    } catch (err) {
      if (err instanceof InvalidDialInParametersError) caughtMissingGrind = true;
    }
    assert('Rejects empty grinder collar setting', caughtMissingGrind);

    // Record valid dial-in shot: 18.5g in, 38.0g out in 28 seconds (Ratio 1:2.05, Flow 1.36 g/s)
    const initialLotWeight = getActiveBeanLot(db)?.remaining_weight_g || 0;
    const initialGrinderUsage = getPrimaryGrinder(db).cumulative_ground_g;

    const dialIn = logDialIn(db, {
      bean_lot_id: newLot.id,
      dose_grams: 18.5,
      yield_grams: 38.0,
      time_seconds: 28,
      grind_setting: '2.4',
      tasting_notes: 'Jasmine, Red Plum, Crisp Citric Acidity, Velvet Body',
      barista_name: 'Lead Barista',
    });

    assert('Dial-in record returned valid ID', Boolean(dialIn.id));
    assert('Calculated brew ratio is 1:2.05', dialIn.ratio === 2.05, `Got: ${dialIn.ratio}`);
    assert('Calculated flow rate is 1.36 g/s', dialIn.flow_rate_gps === 1.36, `Got: ${dialIn.flow_rate_gps}`);
    assert('Tasting notes preserved', dialIn.tasting_notes === 'Jasmine, Red Plum, Crisp Citric Acidity, Velvet Body');

    // Verify Bean Lot deduction
    const currentLotWeight = getActiveBeanLot(db)?.remaining_weight_g || 0;
    const expectedWeight = Math.round((initialLotWeight - 18.5) * 100) / 100;
    assert('Bean lot weight deducted by calibration waste dose (18.5g)', currentLotWeight === expectedWeight, `Was ${initialLotWeight}, now ${currentLotWeight}`);

    // Verify FEFO Stock Movement record was logged as DIAL_IN_SHOT
    const wasteMovement = db
      .prepare("SELECT * FROM cfr_stock_movements WHERE type = 'WASTE' AND reason LIKE 'DIAL_IN_SHOT%' ORDER BY created_at DESC LIMIT 1")
      .get() as any;
    assert('Logged zero-revenue DIAL_IN_SHOT waste movement in FEFO ledger', Boolean(wasteMovement && wasteMovement.qty === 18.5));

    // Verify Grinder Burr usage incremented
    const currentGrinderUsage = getPrimaryGrinder(db).cumulative_ground_g;
    assert('Grinder burr usage accumulated 18.5g', currentGrinderUsage === initialGrinderUsage + 18.5);

    // Retrieve latest dial-in
    const latest = getLatestDialIn(db);
    assert('getLatestDialIn returns the recorded shot', latest?.id === dialIn.id);

    // Retrieve dial-in history
    const history = listDialInHistory(db, 10);
    assert('listDialInHistory contains recorded shot', history.length >= 1 && history[0].id === dialIn.id);

    // ── 5. Grinder Burr Wear & Lifespan Tracker ──────────────────────────────
    console.log('\nTest Suite 5: Commercial Grinder Burr Wear & Lifespan Alerts');

    const grinder = getPrimaryGrinder(db);
    assert('Primary grinder has 500 kg burr rating', grinder.burr_capacity_kg === 500);

    // Simulate 350 kg ground -> 70% wear -> status GOOD
    recordGrindUsage(db, grinder.id, 350 * 1000);
    const gGood = getPrimaryGrinder(db);
    assert('At 70% wear status is GOOD', gGood.status === 'GOOD', `Status: ${gGood.status}`);

    // Simulate 60 kg more ground -> 410 kg total (82% wear) -> status INSPECTION_DUE
    recordGrindUsage(db, grinder.id, 60 * 1000);
    const gInspect = getPrimaryGrinder(db);
    assert('At 82% wear status triggers INSPECTION_DUE alert', gInspect.status === 'INSPECTION_DUE', `Status: ${gInspect.status}, wear: ${gInspect.wear_percentage}%`);

    // Simulate 100 kg more ground -> 510 kg total (102% wear) -> status REPLACEMENT_REQUIRED
    recordGrindUsage(db, grinder.id, 100 * 1000);
    const gReplace = getPrimaryGrinder(db);
    assert('At >100% wear status triggers REPLACEMENT_REQUIRED alert', gReplace.status === 'REPLACEMENT_REQUIRED', `Status: ${gReplace.status}`);
    assert('Remaining burr capacity is 0 kg when exceeded', gReplace.remaining_capacity_kg === 0);

    // Reset burrs after maintenance replacement
    const gReset = resetGrinderBurrs(db, grinder.id);
    assert('resetGrinderBurrs resets cumulative ground to 0 kg', gReset.cumulative_ground_kg === 0);
    assert('Status resets to GOOD after replacement', gReset.status === 'GOOD');
    assert('Remaining capacity restores to 500 kg', gReset.remaining_capacity_kg === 500);

    // Summary
    console.log('\n========================================================================');
    console.log(`CFR Specialty Coffee Verification: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    db.close();
    try {
      fs.unlinkSync(tempDbPath);
    } catch {}
  }
}

runTests();
