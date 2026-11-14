/**
 * CFR OS: Week 6 Automated Verification Suite
 * Luxury Digital Guest Menu, Hardware Equipment Adapters & Ambience Controller
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runCfrMigrations } from '../main/cfr/db/migrator';
import {
  getPublicDigitalMenu,
  getMenuItemById,
  setMenuItemAvailability,
  validateMenuPricePaise,
  InvalidMenuPriceError,
} from '../main/cfr/menu/menu-engine';
import { ovenAdapter } from '../main/cfr/adapters/oven-adapter';
import { espressoAdapter } from '../main/cfr/adapters/espresso-adapter';
import { pagerAdapter } from '../main/cfr/adapters/pager-adapter';
import { ambienceAdapter } from '../main/cfr/adapters/ambience-adapter';

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
  console.log('CFR OS: Guest Digital Menu & Hardware Adapters Test Suite');
  console.log('========================================================================\n');

  const tempDbPath = path.join(os.tmpdir(), `cfr-menu-adapters-test-${Date.now()}.db`);
  const db = new Database(tempDbPath);

  try {
    // ── 1. Schema Initialization & Seeds ────────────────────────────────────
    console.log('Test Suite 1: Schema Initialization & Standard 7 Sections Seed');
    runCfrMigrations(db);

    const sectionCount = (
      db.prepare('SELECT COUNT(*) as c FROM cfr_menu_sections').get() as { c: number }
    ).c;
    assert('7 signature CFR menu sections seeded', sectionCount === 7, `Found ${sectionCount}`);

    const itemCount = (
      db.prepare('SELECT COUNT(*) as c FROM cfr_menu_items').get() as { c: number }
    ).c;
    assert('24 artisanal menu offerings seeded', itemCount === 24, `Found ${itemCount}`);

    const taskCount = (
      db.prepare('SELECT COUNT(*) as c FROM cfr_equipment_tasks').get() as { c: number }
    ).c;
    assert('Commercial equipment tasks seeded (Oven, Espresso, Grinder)', taskCount >= 4, `Found ${taskCount}`);

    // ── 2. Strict ₹10 Price Increments & 100% Dietary Policy Invariants ──────
    console.log('\nTest Suite 2: Menu Pricing & Dietary Policy Invariants');

    // Price Guard
    assert('Validates ₹220 (22,000 paise)', (() => {
      try { validateMenuPricePaise(22000); return true; } catch { return false; }
    })());
    assert('Validates ₹480 (48,000 paise)', (() => {
      try { validateMenuPricePaise(48000); return true; } catch { return false; }
    })());

    let caughtInvalidPrice = false;
    try {
      validateMenuPricePaise(22500); // ₹225 - not a ₹10 multiple
    } catch (err) {
      if (err instanceof InvalidMenuPriceError) caughtInvalidPrice = true;
    }
    assert('Rejects ₹225 (violates ₹10 price increments)', caughtInvalidPrice);

    // Verify all seeded items comply with ₹10 increments and 100% eggless
    const allItems = db.prepare('SELECT * FROM cfr_menu_items').all() as any[];
    const allPricesCompliant = allItems.every((item) => item.price_paise % 1000 === 0 && item.price_paise > 0);
    assert('All 21 seeded items strictly follow ₹10 price increments', allPricesCompliant);

    const allDietaryCompliant = allItems.every(
      (item) =>
        !item.dietary_flags.includes('CONTAINS_EGG') &&
        !item.dietary_flags.includes('GELATIN') &&
        !item.dietary_flags.includes('ANIMAL_RENNET') &&
        (item.dietary_flags.includes('VEGAN') || item.dietary_flags.includes('LACTO_VEG'))
    );
    assert('All 21 seeded items comply with 100% vegetarian & eggless policy', allDietaryCompliant);

    // ── 3. Public Digital Menu Retrieval & Real-Time 86\'d Availability ─────
    console.log('\nTest Suite 3: Public Digital Menu Retrieval & 86\'d Availability');

    const menu = getPublicDigitalMenu(db, true);
    assert('Menu returns brand metadata and Haryana tax policy', menu.brand.includes('Coffee First Ritual'));
    assert('Menu has 7 sections populated', menu.sections.length === 7);

    const croissant = getMenuItemById(db, 'item_croissant_butter');
    assert('Croissant item retrieved with craft story', Boolean(croissant && croissant.craft_story.includes('Normandy')));
    assert('Croissant is currently available', croissant?.is_available === true);

    // 86 (mark sold-out) the croissant
    const soldOutCroissant = setMenuItemAvailability(db, 'item_croissant_butter', false);
    assert('Item availability toggled to false (86\'d)', soldOutCroissant.is_available === false);

    // Fetch menu with includeUnavailable = false
    const menuAvailableOnly = getPublicDigitalMenu(db, false);
    const boulangerie = menuAvailableOnly.sections.find((s) => s.id === 'sec_boulangerie');
    const croissantPresent = boulangerie?.items.some((i) => i.id === 'item_croissant_butter');
    assert('Sold-out item is excluded when filtering available-only', croissantPresent === false);

    // Restore croissant availability
    setMenuItemAvailability(db, 'item_croissant_butter', true);
    const restoredCroissant = getMenuItemById(db, 'item_croissant_butter');
    assert('Croissant availability restored to true', restoredCroissant?.is_available === true);

    // ── 4. Commercial Oven Hardware Adapter (Unox Bakertop) ─────────────────
    console.log('\nTest Suite 4: Commercial Combi Oven Hardware Adapter');

    const ovenStatus = ovenAdapter.getStatus();
    assert('Oven connected and telemetry active', ovenStatus.connected && ovenStatus.actual_temperature_c === 175);

    const programs = ovenAdapter.listPrograms();
    assert('Lists standard Unox bake programs (Viennoiserie, Sourdough, Tartines)', programs.length >= 5);

    const startedProg = ovenAdapter.startProgram('prog_croissant');
    assert('Program started sets target temperature (175°C)', startedProg.temperature_celsius === 175);

    const ovenTasks = ovenAdapter.getTasks(db);
    assert('Oven tasks retrieved from database', ovenTasks.length >= 2);

    const completedOvenTask = ovenAdapter.completeTask(db, 'task_unox_wash_pm', 'Head Baker');
    assert('Oven chemical wash task marked completed', completedOvenTask.is_completed === true && completedOvenTask.completed_by === 'Head Baker');

    // ── 5. Commercial Espresso Machine Hardware Adapter (La Marzocco KB90) ──
    console.log('\nTest Suite 5: Commercial Espresso Machine Hardware Adapter');

    const telemetry = espressoAdapter.getTelemetry(db);
    assert('La Marzocco KB90 brew boiler temperature is 93.5°C', telemetry.brew_boiler_temp_c === 93.5);
    assert('Steam boiler pressure is 1.8 bar', telemetry.steam_boiler_pressure_bar === 1.8);
    assert('Chemical backflush due before completion', telemetry.chemical_backflush_due === true);

    const completedBackflush = espressoAdapter.completeTask(db, 'task_kb90_backflush_pm', 'Lead Barista');
    assert('KB90 chemical backflush task marked completed', completedBackflush.is_completed === true);

    const telemetryAfter = espressoAdapter.getTelemetry(db);
    assert('Chemical backflush due clears after completion', telemetryAfter.chemical_backflush_due === false);

    // ── 6. Server Wrist Pager Adapter & KDS Order Ready Trigger ──────────────
    console.log('\nTest Suite 6: Server Wrist Pager Adapter & KDS Ready Hook');

    // Mock an order in the orders table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tables (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY, order_number TEXT, dining_option TEXT, table_id INTEGER, status TEXT, created_at TEXT, updated_at TEXT
      );
    `);

    db.prepare("INSERT INTO tables (id, name) VALUES (4, 'Table 4')").run();
    db.prepare(`
      INSERT INTO orders (id, order_number, dining_option, table_id, status, created_at, updated_at)
      VALUES (101, 'CFR-101', 'dine_in', 4, 'preparing', '2026-11-15T00:00:00Z', '2026-11-15T00:00:00Z')
    `).run();

    // Trigger KDS order ready pager buzz
    const buzzEvent = pagerAdapter.triggerOrderReadyPager(db, 101);
    assert('Pager buzz event generated for ready order', Boolean(buzzEvent && buzzEvent.id));
    assert('Pager message specifies order number and destination', Boolean(buzzEvent?.message.includes('CFR-101') && buzzEvent?.message.includes('Table 4')));

    // Manual pager buzz
    const manualBuzz = pagerAdapter.buzzPager(db, {
      message: 'Takeaway Counter: Order #102 is packed',
      tableNumber: 'Takeaway',
      serverName: 'Floor Lead',
    });
    assert('Manual pager buzz logged successfully', manualBuzz.status === 'SENT');

    const logs = pagerAdapter.getLogs(db, 5);
    assert('Pager logs query returns recent events', logs.length >= 2);

    // ── 7. Ambience, Lighting & Audio Scene Adapter ──────────────────────────
    console.log('\nTest Suite 7: Ambience, Lighting & Sonos Audio Scene Adapter');

    // 10:00 AM -> WORKSPACE
    const morningDate = new Date('2026-11-15T10:00:00');
    const morningScene = ambienceAdapter.getCurrentAmbience(morningDate);
    assert('At 10:00 AM active scene is WORKSPACE', morningScene.scene === 'WORKSPACE');
    assert('WORKSPACE uses 4,000K neutral white lighting', morningScene.color_temp_kelvin === 4000);
    assert('WORKSPACE target sound level is 60 dB', morningScene.target_db === 60);

    // 17:00 (5:00 PM) -> GOLDEN_HOUR
    const afternoonDate = new Date('2026-11-15T17:00:00');
    const afternoonScene = ambienceAdapter.getCurrentAmbience(afternoonDate);
    assert('At 17:00 active scene is GOLDEN_HOUR', afternoonScene.scene === 'GOLDEN_HOUR');
    assert('GOLDEN_HOUR uses 2,700K warm amber lighting', afternoonScene.color_temp_kelvin === 2700);

    // 20:00 (8:00 PM) -> EVENING_LOUNGE
    const eveningDate = new Date('2026-11-15T20:00:00');
    const eveningScene = ambienceAdapter.getCurrentAmbience(eveningDate);
    assert('At 20:00 active scene is EVENING_LOUNGE', eveningScene.scene === 'EVENING_LOUNGE');
    assert('EVENING_LOUNGE uses 2,200K candlelight warmth', eveningScene.color_temp_kelvin === 2200);

    // Manual Override
    const overridden = ambienceAdapter.setOverride('GOLDEN_HOUR', 30);
    assert('Manual override successfully forces scene', overridden.scene === 'GOLDEN_HOUR' && overridden.is_override === true);

    const cleared = ambienceAdapter.clearOverride();
    assert('Clear override reverts to scheduled scene', cleared.is_override === false);

    // Summary
    console.log('\n========================================================================');
    console.log(`CFR Week 6 Verification: ${passed} Passed, ${failed} Failed`);
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
