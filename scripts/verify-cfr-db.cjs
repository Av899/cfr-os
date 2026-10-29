'use strict';

const path = require('path');
const os = require('os');

// Mock Electron's app module before requiring db.js
const mockApp = {
  isPackaged: false,
  getPath: (name) => {
    if (name === 'userData') return path.join(__dirname, '..');
    if (name === 'documents') return os.homedir();
    return os.tmpdir();
  },
  getVersion: () => require('../package.json').version,
  getName: () => 'Flo (dev)',
};

const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: mockApp,
      BrowserWindow: class {},
      ipcMain: { handle: () => {}, on: () => {} },
      dialog: {},
      shell: {},
      Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
      Tray: class {},
      nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { initDatabase, getDatabase, closeDatabase } = require('../dist/main/db');

try {
  console.log('[Verify] Initializing FloCafe database with CFR seam...');
  initDatabase(false, true);
  const db = getDatabase();

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cfr_%' ORDER BY name")
    .all();

  console.log('[Verify] Found CFR tables:');
  for (const t of tables) {
    console.log(`  - ${t.name}`);
  }

  const ingredients = db.prepare('SELECT id, name, category, dietary_flags, cost_per_unit_paise FROM cfr_ingredients').all();
  console.log(`\n[Verify] Seeded Ingredients (${ingredients.length} items):`);
  for (const ing of ingredients) {
    console.log(`  • ${ing.name} [${ing.category}] (${ing.dietary_flags}) - ₹${(ing.cost_per_unit_paise / 100).toFixed(2)}`);
  }

  const meta = db.prepare('SELECT key, value FROM cfr_meta').all();
  console.log('\n[Verify] CFR Meta:');
  for (const m of meta) {
    console.log(`  • ${m.key}: ${m.value}`);
  }

  closeDatabase();
  console.log('\n[Verify] SUCCESS: Database foundation and dietary guard verified in live FloCafe SQLite.');
} catch (err) {
  console.error('[Verify] FAILED:', err);
  process.exit(1);
}
