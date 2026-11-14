/**
 * CFR OS: Week 7 Automated Verification Suite
 * Daily Z-Report, Shift Balancing, Accountant GST Export & Safe SQLite Backup
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runCfrMigrations } from '../main/cfr/db/migrator';
import { issueCfrInvoice, issueCfrCreditNote } from '../main/cfr/invoicing/sequence';
import { createPaymentRecord, reconcileGatewayPayment } from '../main/cfr/payments/reconciler';
import { logDialIn } from '../main/cfr/coffee/dial-in';
import { receiveStockLot, recordWaste } from '../main/cfr/inventory/fefo';
import {
  generateDailyZReport,
  formatZReportThermalReceipt,
} from '../main/cfr/reports/z-report';
import {
  generateGstExportRows,
  generateGstCsvString,
} from '../main/cfr/reports/accountant-export';
import {
  runSafeBackup,
  listBackups,
} from '../main/cfr/backup/sqlite-backup';
import { formatLocalDateString } from '../main/cfr/coffee/bean-lots';

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
  console.log('CFR OS: Daily Z-Report, Accountant Export & SQLite Backup Test Suite');
  console.log('========================================================================\n');

  const tempDbPath = path.join(os.tmpdir(), `cfr-zreport-test-${Date.now()}.db`);
  const tempBackupDir = path.join(os.tmpdir(), `cfr-backups-${Date.now()}`);
  const db = new Database(tempDbPath);

  try {
    // ── 1. Setup & Simulation of Daily Transactions ─────────────────────────
    console.log('Test Suite 1: Schema Initialization & Full Day Lifecycle Simulation');
    runCfrMigrations(db);

    const today = new Date();
    const todayStr = formatLocalDateString(today);

    // Mock FloCafe core tables for order linkage
    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT,
        dining_option TEXT,
        table_id INTEGER,
        status TEXT,
        payment_method TEXT,
        total_cents INTEGER,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER,
        product_name TEXT,
        quantity INTEGER,
        price_cents INTEGER,
        status TEXT
      );
      CREATE TABLE IF NOT EXISTS tables (id INTEGER PRIMARY KEY, name TEXT);
    `);

    // Receive raw ingredients into stock lots so BOM and waste have physical backing
    receiveStockLot(db, {
      ingredient_id: 'ing_beans_subko_lot',
      batch_no: 'SUBKO-WK7-BATCH',
      expiry_date: '2027-01-01',
      initial_qty: 5000,
      unit_cost_paise: 320,
    });
    receiveStockLot(db, {
      ingredient_id: 'ing_flour_t55_french',
      batch_no: 'T55-WK7-BATCH',
      expiry_date: '2027-01-01',
      initial_qty: 20000,
      unit_cost_paise: 18,
    });

    // Simulate Transaction 1: Double Espresso + French Croissant (₹460.00 Taxable)
    // Order 1 -> ₹460 taxable -> 5% GST = ₹23.00 -> Net Payable ₹483.00
    db.prepare(`
      INSERT INTO orders (id, order_number, dining_option, status, payment_method, total_cents, created_at, updated_at)
      VALUES (201, 'CFR-201', 'dine_in', 'completed', 'upi', 48300, ?, ?)
    `).run(today.toISOString(), today.toISOString());

    db.prepare(`
      INSERT INTO order_items (id, order_id, product_name, quantity, price_cents, status)
      VALUES (1, 201, 'Signature Double Espresso', 1, 22000, 'served'),
             (2, 201, '27-Layer French Butter Croissant', 1, 24000, 'served')
    `).run();

    const inv1 = issueCfrInvoice(db, {
      order_id: '201',
      taxable_paise: 46000,
      payment_method: 'UPI_DYNAMIC',
      payment_ref: 'UPI/20261115/001',
      custom_date: today,
    });
    assert('Invoice 1 generated with sequential numbering', inv1.invoice.invoice_number === 'CFR/26-27/000001');

    // Simulate Transaction 2: Flat White + Avocado Tartine (₹640.00 Taxable) Paid in Cash
    // Order 2 -> ₹640 taxable -> 5% GST = ₹32.00 -> Net Payable ₹672.00
    db.prepare(`
      INSERT INTO orders (id, order_number, dining_option, status, payment_method, total_cents, created_at, updated_at)
      VALUES (202, 'CFR-202', 'dine_in', 'completed', 'cash', 67200, ?, ?)
    `).run(today.toISOString(), today.toISOString());

    const inv2 = issueCfrInvoice(db, {
      order_id: '202',
      taxable_paise: 64000,
      payment_method: 'CASH',
      custom_date: today,
    });
    assert('Invoice 2 generated sequentially', inv2.invoice.invoice_number === 'CFR/26-27/000002');

    // Simulate Transaction 3: V60 Pourover (₹300.00) Voided with Credit Note
    db.prepare(`
      INSERT INTO orders (id, order_number, dining_option, status, payment_method, total_cents, created_at, updated_at)
      VALUES (203, 'CFR-203', 'dine_in', 'cancelled', 'upi', 31500, ?, ?)
    `).run(today.toISOString(), today.toISOString());

    const inv3 = issueCfrInvoice(db, {
      order_id: '203',
      taxable_paise: 30000,
      payment_method: 'UPI_DYNAMIC',
      custom_date: today,
    });
    const creditNote = issueCfrCreditNote(db, {
      invoice_id: inv3.invoice.id,
      reason: 'Customer requested order cancellation prior to brewing',
      custom_date: today,
    });
    assert('Credit Note generated sequentially', creditNote.credit_note_number === 'CN/26-27/000001');

    // Simulate Barista Morning Dial-in Calibration Shot (18.5g waste)
    const dialIn = logDialIn(db, {
      dose_grams: 18.5,
      yield_grams: 38.0,
      time_seconds: 28,
      grind_setting: '2.4',
      tasting_notes: 'Jasmine, stone fruit sweetness, crisp acidity',
      barista_name: 'Lead Barista',
    });
    assert('Dial-in calibration shot recorded', Boolean(dialIn.id));

    // ── 2. Daily Z-Report Generation & Reconciliation ───────────────────────
    console.log('\nTest Suite 2: Daily Z-Report Generation & Financial Reconciliation');

    const zReport = generateDailyZReport(db, {
      businessDate: todayStr,
      openingFloatPaise: 500000, // ₹5,000.00
      actualCountedCashPaise: 567200, // Exactly ₹5,000 + ₹672 cash sales
    });

    assert('Z-Report generated with valid report number', zReport.report_number.startsWith('Z-'));
    assert('Z-Report business date matches', zReport.business_date === todayStr);

    // Financial totals:
    // Active invoices: Inv 1 (₹460 taxable, ₹23 GST, ₹483 total) + Inv 2 (₹640 taxable, ₹32 GST, ₹672 total)
    // Total taxable = ₹1,100.00 (110,000 paise)
    // CGST (2.5%) = ₹27.50 (2,750 paise), SGST (2.5%) = ₹27.50 (2,750 paise)
    // Total GST = ₹55.00 (5,500 paise)
    // Net Payable = ₹1,155.00 (115,500 paise)
    assert('Total Net Taxable is 110,000 paise (₹1,100.00)', zReport.financials.net_taxable_paise === 110000, `Got ${zReport.financials.net_taxable_paise}`);
    assert('Total CGST (2.5%) is 2,750 paise (₹27.50)', zReport.financials.cgst_paise === 2750);
    assert('Total SGST (2.5%) is 2,750 paise (₹27.50)', zReport.financials.sgst_paise === 2750);
    assert('Total 5% GST is 5,500 paise (₹55.00)', zReport.financials.total_gst_paise === 5500);
    assert('Total Net Payable is 115,500 paise (₹1,155.00)', zReport.financials.net_payable_paise === 115500);

    // Credit Note count & amount
    assert('Credit notes count is 1', zReport.operations.credit_notes_count === 1);
    assert('Credit note amount matches Inv 3 (₹315.00)', zReport.operations.credit_notes_amount_paise === 31500);

    // Cash Drawer Reconciliation
    assert('Opening cash float recorded as ₹5,000.00', zReport.cash_drawer.opening_float_paise === 500000);
    assert('Cash sales from Order 2 recorded as ₹672.00', zReport.cash_drawer.cash_sales_paise === 67200);
    assert('Expected drawer cash is ₹5,672.00', zReport.cash_drawer.expected_drawer_cash_paise === 567200);
    assert('Actual counted cash is ₹5,672.00', zReport.cash_drawer.actual_counted_cash_paise === 567200);
    assert('Cash variance is 0 (Perfect Balance)', zReport.cash_drawer.cash_variance_paise === 0);
    assert('Cash drawer is balanced', zReport.cash_drawer.is_balanced === true);

    // Verify cash discrepancy detection when short
    const zReportShort = generateDailyZReport(db, {
      businessDate: todayStr,
      openingFloatPaise: 500000,
      actualCountedCashPaise: 566200, // ₹10 short
    });
    assert('Detects ₹10 cash shortage (-1,000 paise)', zReportShort.cash_drawer.cash_variance_paise === -1000);
    assert('Marks drawer as not balanced on variance', zReportShort.cash_drawer.is_balanced === false);

    // COGS & Food Cost
    assert('Calibration waste cost recorded from dial-in', zReport.cogs.calibration_waste_paise > 0);
    assert('Food cost percentage calculated', zReport.cogs.food_cost_percentage >= 0);

    // Thermal Slip Receipt Formatting
    const receiptText = formatZReportThermalReceipt(zReport);
    assert('Thermal slip includes store header', receiptText.includes('COFFEE FIRST RITUAL'));
    assert('Thermal slip includes Z-Report title', receiptText.includes('END-OF-DAY Z-REPORT'));
    assert('Thermal slip includes GSTIN', receiptText.includes('06ABCDE1234F1Z5'));
    assert('Thermal slip includes net payable ₹1,155.00', receiptText.includes('₹1155.00'));
    assert('Thermal slip includes balanced drawer status', receiptText.includes('BALANCED (PERFECT)'));
    assert('Thermal slip includes 100% eggless footer', receiptText.includes('100% VEGETARIAN & ARTISANAL EGGLESS'));

    // ── 3. Chartered Accountant GSTR-1 CSV Export ────────────────────────────
    console.log('\nTest Suite 3: Chartered Accountant GSTR-1 CSV Export');

    const exportRows = generateGstExportRows(db, todayStr, todayStr);
    assert('GSTR-1 export includes all issued invoices and credit notes', exportRows.length === 4);

    const inv1Row = exportRows.find((r) => r.invoice_number === 'CFR/26-27/000001');
    assert('Invoice 1 taxable value is 460.00', inv1Row?.taxable_value === '460.00');
    assert('Invoice 1 CGST is 11.50', inv1Row?.cgst_amount === '11.50');
    assert('Invoice 1 SGST is 11.50', inv1Row?.sgst_amount === '11.50');
    assert('Invoice 1 Total is 483.00', inv1Row?.invoice_total === '483.00');
    assert('Invoice 1 Place of Supply is 06-Haryana', inv1Row?.place_of_supply === '06-Haryana');

    const cnRow = exportRows.find((r) => r.invoice_number === 'CN/26-27/000001');
    assert('Credit Note exported with negative total', cnRow?.invoice_total === '-315.00');
    assert('Credit Note marked with type "Credit Note"', cnRow?.invoice_type === 'Credit Note');

    const csvOutput = generateGstCsvString(exportRows);
    assert('CSV starts with standard GSTR-1 headers', csvOutput.startsWith('Invoice Number,Invoice Date,Customer GSTIN'));
    assert('CSV contains Invoice 1 row', csvOutput.includes('CFR/26-27/000001'));
    assert('CSV contains Credit Note row', csvOutput.includes('CN/26-27/000001'));

    // ── 4. Safe Online SQLite Backup (VACUUM INTO) ───────────────────────────
    console.log('\nTest Suite 4: Safe Online SQLite Backup & Integrity Verification');

    const backup = runSafeBackup(db, tempBackupDir);
    assert('Backup completed and returned metadata', Boolean(backup && backup.file_name));
    assert('Backup file exists on disk', fs.existsSync(backup.file_path));
    assert('Backup integrity check passed (OK)', backup.integrity_status.toLowerCase() === 'ok');

    // Open the snapshot database directly to verify table contents
    const snapshotDb = new Database(backup.file_path, { readonly: true });
    const snapshotInvoices = (
      snapshotDb.prepare('SELECT COUNT(*) as c FROM cfr_invoices').get() as { c: number }
    ).c;
    assert('Snapshot database contains all 3 invoices intact', snapshotInvoices === 3);

    const snapshotMenuItems = (
      snapshotDb.prepare('SELECT COUNT(*) as c FROM cfr_menu_items').get() as { c: number }
    ).c;
    assert('Snapshot database contains all 24 menu items', snapshotMenuItems === 24);
    snapshotDb.close();

    // Verify backup listing
    const backupList = listBackups(tempBackupDir);
    assert('listBackups discovers the created snapshot', backupList.length >= 1 && backupList[0].file_name === backup.file_name);

    // Summary
    console.log('\n========================================================================');
    console.log(`CFR Week 7 Verification: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    db.close();
    try {
      fs.unlinkSync(tempDbPath);
      // Clean up temp backup files
      if (fs.existsSync(tempBackupDir)) {
        for (const f of fs.readdirSync(tempBackupDir)) {
          fs.unlinkSync(path.join(tempBackupDir, f));
        }
        fs.rmdirSync(tempBackupDir);
      }
    } catch {}
  }
}

runTests();
