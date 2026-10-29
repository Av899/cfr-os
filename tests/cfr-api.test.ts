/**
 * CFR OS: API Endpoints Test Suite
 * Tests /api/cfr/* endpoints over HTTP.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-api.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfr-api-test-'));

Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: () => testDir,
        getVersion: () => '3.13.14',
        getName: () => 'CFR-OS-Test',
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

const express = require('express');
const http = require('http');
const { initDatabase, getDatabase, closeDatabase } = require('../main/db');
const { registerRoutes } = require('../main/routes');

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

async function request(serverUrl: string, method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${serverUrl}${path}`, options);
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function run() {
  console.log('\n--- CFR OS Endpoint Integration Tests ---\n');

  // 1. Initialize SQLite Database (runs both FloCafe and CFR migrations)
  console.log('[1/4] Initializing Database with CFR Seam...');
  initDatabase(false, true);

  // 2. Create Express app with full routes mounted
  console.log('[2/4] Mounting Express routes and starting ephemeral HTTP server...');
  const app = express();
  app.use(express.json());
  registerRoutes(app);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[3/4] Test server listening on ${baseUrl}\n`);

  // 3. Test Suite Execution
  console.log('--- Testing GET /api/cfr/health ---');
  const healthRes = await request(baseUrl, 'GET', '/api/cfr/health');
  assert(healthRes.status === 200, `Health returns 200 (got ${healthRes.status})`);
  assert(healthRes.data?.status === 'ok', 'Status is "ok"');
  assert(healthRes.data?.brand === 'Coffee First Ritual (CFR)', 'Brand is Coffee First Ritual (CFR)');
  assert(healthRes.data?.location.includes('Karnal'), 'Location is Sector 12, Karnal');
  assert(healthRes.data?.schema_version === 1, 'CFR Schema version is 1');
  assert(healthRes.data?.counts?.ingredients >= 10, `Initial seeded ingredients >= 10 (got ${healthRes.data?.counts?.ingredients})`);

  console.log('\n--- Testing GET /api/cfr/ingredients ---');
  const ingRes = await request(baseUrl, 'GET', '/api/cfr/ingredients');
  assert(ingRes.status === 200, `Ingredients returns 200 (got ${ingRes.status})`);
  assert(ingRes.data?.total >= 10, `Total ingredients >= 10 (got ${ingRes.data?.total})`);
  const blueTokai = ingRes.data?.ingredients?.find((i: any) => i.id === 'ing_beans_bt_attikan');
  assert(blueTokai !== undefined, 'Found Blue Tokai Attikan Estate Beans');
  assert(blueTokai?.dietary_flags === 'VEGAN,EGGLESS', 'Blue Tokai is tagged VEGAN,EGGLESS');
  assert(blueTokai?.cost_per_unit_paise === 250, 'Blue Tokai cost is 250 paise (₹2.50/g)');

  console.log('\n--- Testing POST /api/cfr/dietary/validate ---');
  const safeCheck = await request(baseUrl, 'POST', '/api/cfr/dietary/validate', {
    flags: 'VEGAN,EGGLESS,GLUTEN_FREE',
  });
  assert(safeCheck.status === 200, 'Safe flags check returns 200');
  assert(safeCheck.data?.safe === true, 'Safe flags are confirmed safe');

  const unsafeCheck = await request(baseUrl, 'POST', '/api/cfr/dietary/validate', {
    flags: 'LACTO_VEG,CONTAINS_EGG',
  });
  assert(unsafeCheck.status === 200, 'Unsafe flags check returns 200');
  assert(unsafeCheck.data?.safe === false, 'Egg flag is confirmed unsafe');

  console.log('\n--- Testing POST /api/cfr/ingredients (Positive Case) ---');
  const addSafeRes = await request(baseUrl, 'POST', '/api/cfr/ingredients', {
    name: 'Madagascar Bourbon Vanilla Pods',
    category: 'spices_flavor',
    base_unit: 'g',
    cost_per_unit_paise: 650, // ₹6.50/g
    par_level: 500,
    dietary_flags: 'VEGAN,EGGLESS',
  });
  assert(addSafeRes.status === 201, `Adding 100% eggless ingredient returns 201 Created (got ${addSafeRes.status})`);
  assert(addSafeRes.data?.ingredient?.name === 'Madagascar Bourbon Vanilla Pods', 'Ingredient name is preserved');

  console.log('\n--- Testing POST /api/cfr/ingredients (Negative: Egg Violation) ---');
  const addEggRes = await request(baseUrl, 'POST', '/api/cfr/ingredients', {
    name: 'Farm Fresh Brown Eggs',
    category: 'dairy',
    base_unit: 'piece',
    cost_per_unit_paise: 800,
    par_level: 60,
    dietary_flags: 'CONTAINS_EGG',
  });
  assert(addEggRes.status === 422, `Adding egg ingredient returns 422 Unprocessable Entity (got ${addEggRes.status})`);
  assert(addEggRes.data?.code === 'ERR_CFR_DIETARY_VIOLATION', 'Error code is ERR_CFR_DIETARY_VIOLATION');
  assert(addEggRes.data?.error?.includes('contains forbidden substance flag "CONTAINS_EGG"'), 'Error message cites egg violation');

  console.log('\n--- Testing POST /api/cfr/ingredients (Negative: Gelatin Violation) ---');
  const addGelatinRes = await request(baseUrl, 'POST', '/api/cfr/ingredients', {
    name: 'Bovine Gelatin Sheets',
    category: 'dry_good',
    base_unit: 'piece',
    cost_per_unit_paise: 45,
    par_level: 100,
    dietary_flags: 'GELATIN',
  });
  assert(addGelatinRes.status === 422, `Adding gelatin returns 422 Unprocessable Entity (got ${addGelatinRes.status})`);
  assert(addGelatinRes.data?.banned_flag === 'GELATIN', 'Banned flag is GELATIN');

  console.log('\n--- Verifying Final Ingredients Count ---');
  const finalIngRes = await request(baseUrl, 'GET', '/api/cfr/ingredients');
  assert(finalIngRes.data?.total === ingRes.data?.total + 1, `Total is exactly previous + 1 (got ${finalIngRes.data?.total})`);

  console.log('\n--- Testing POST /api/cfr/invoices/preview (Golden Fixture) ---');
  const previewRes = await request(baseUrl, 'POST', '/api/cfr/invoices/preview', {
    items: [
      { name: 'Melbourne Magic', rate_paise: 23000, quantity: 1 },
      { name: 'Pistachio Croissant', rate_paise: 22000, quantity: 1 },
    ],
  });
  assert(previewRes.status === 200, 'Invoice preview returns 200');
  assert(previewRes.data?.taxable_subtotal === 45000, 'Preview taxable subtotal is ₹450.00 (45,000 paise)');
  assert(previewRes.data?.gst_breakdown?.cgst_paise === 1125, 'Preview CGST is ₹11.25');
  assert(previewRes.data?.gst_breakdown?.sgst_paise === 1125, 'Preview SGST is ₹11.25');
  assert(previewRes.data?.gst_breakdown?.round_off_paise === 50, 'Preview round-off is +₹0.50');
  assert(previewRes.data?.gst_breakdown?.payable_paise === 47300, 'Preview Net Payable is strictly ₹473.00 (47,300 paise)');

  console.log('\n--- Testing POST /api/cfr/invoices/preview (Invalid Price Increment) ---');
  const invalidPreviewRes = await request(baseUrl, 'POST', '/api/cfr/invoices/preview', {
    items: [
      { name: 'Invalid Item', rate_paise: 23500, quantity: 1 },
    ],
  });
  assert(invalidPreviewRes.status === 400, 'Invalid price increment returns 400 Bad Request');
  assert(invalidPreviewRes.data?.code === 'ERR_CFR_INVALID_PRICE_INCREMENT', 'Error code is ERR_CFR_INVALID_PRICE_INCREMENT');

  console.log('\n--- Testing POST /api/cfr/invoices/issue ---');
  const issueRes = await request(baseUrl, 'POST', '/api/cfr/invoices/issue', {
    order_id: 'ord_live_test_001',
    taxable_paise: 45000,
    payment_method: 'UPI_DYNAMIC',
    payment_ref: 'UPI_REF_987654321',
  });
  assert(issueRes.status === 201, 'Issue invoice returns 201 Created');
  assert(issueRes.data?.invoice?.invoice_number?.startsWith('CFR/'), 'Invoice number begins with CFR/');
  assert(issueRes.data?.invoice?.payable_paise === 47300, 'Issued invoice payable is ₹473.00');
  const issuedInvId = issueRes.data?.invoice?.id;

  console.log('\n--- Testing GET /api/cfr/invoices ---');
  const listInvRes = await request(baseUrl, 'GET', '/api/cfr/invoices');
  assert(listInvRes.status === 200, 'List invoices returns 200');
  assert(listInvRes.data?.total >= 1, 'Invoices list contains at least 1 invoice');

  console.log('\n--- Testing GET /api/cfr/invoices/:id ---');
  const getInvRes = await request(baseUrl, 'GET', `/api/cfr/invoices/${issuedInvId}`);
  assert(getInvRes.status === 200, 'Fetch single invoice returns 200');
  assert(getInvRes.data?.invoice?.id === issuedInvId, 'Fetched invoice matches ID');
  assert(getInvRes.data?.gst?.payable_paise === 47300, 'GST breakdown matches invoice');

  console.log('\n--- Testing GET /api/cfr/invoices/:id/receipt-text ---');
  const receiptRes = await fetch(`${baseUrl}/api/cfr/invoices/${issuedInvId}/receipt-text`);
  const receiptBody = await receiptRes.text();
  assert(receiptRes.status === 200, 'Receipt text endpoint returns 200');
  assert(receiptBody.includes('COFFEE FIRST RITUAL'), 'Receipt text has COFFEE FIRST RITUAL header');
  assert(receiptBody.includes('₹473.00'), 'Receipt text has ₹473.00 total');
  assert(receiptBody.includes('100% ARTISANAL EGGLESS'), 'Receipt text has eggless footer');

  console.log('\n--- Testing POST /api/cfr/invoices/:id/void ---');
  const voidRes = await request(baseUrl, 'POST', `/api/cfr/invoices/${issuedInvId}/void`, {
    reason: 'Customer requested bill refund and reissue',
  });
  assert(voidRes.status === 201, 'Void invoice returns 201 Created');
  assert(voidRes.data?.credit_note?.credit_note_number?.startsWith('CN/'), 'Credit note starts with CN/');
  assert(voidRes.data?.credit_note?.amount_paise === 47300, 'Credit note amount is ₹473.00');

  // Verify status is now CREDIT_NOTE_ISSUED
  const checkVoided = await request(baseUrl, 'GET', `/api/cfr/invoices/${issuedInvId}`);
  assert(checkVoided.data?.invoice?.status === 'CREDIT_NOTE_ISSUED', 'Invoice status transitioned to CREDIT_NOTE_ISSUED');

  // 4. Cleanup
  console.log('\n[4/4] Shutting down test server and closing database...');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDatabase();

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${total} assertions.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All CFR OS HTTP API Endpoints PASSED with 100% success!\n');
  }
}

run().catch((err) => {
  console.error('Fatal error running API tests:', err);
  process.exit(1);
});
