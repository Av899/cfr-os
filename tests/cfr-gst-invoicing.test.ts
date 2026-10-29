/**
 * CFR OS: Week 2 Automated Test Suite
 * Haryana 5% GST Engine, ₹10 Price Guard, Gap-Free FY Invoicing & Thermal Receipts
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-gst-invoicing.test.ts
 */

import Database from 'better-sqlite3';
import {
  calculateHaryanaGst,
  validatePriceIncrement,
  InvalidPriceIncrementError,
  formatRupees,
} from '../main/cfr/money/gst-engine';
import {
  getFinancialYear,
  issueCfrInvoice,
  issueCfrCreditNote,
} from '../main/cfr/invoicing/sequence';
import { runCfrMigrations } from '../main/cfr/db/migrator';
import { generateThermalReceiptText, ReceiptItem } from '../main/cfr/templates/thermal-receipt';

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
    if (err.code === expectedCode || err.name === 'InvalidPriceIncrementError' || String(err).includes(expectedCode)) {
      passed++;
      console.log(`  ✓ ${label} (caught expected ${expectedCode})`);
    } else {
      failed++;
      console.error(`  ✗ ${label} — unexpected error: ${err.message || err}`);
    }
  }
}

console.log('\n--- Test Suite 1: Strict ₹10 Price Increment Guard ---');

// Multiples of 1,000 paise (₹10.00) pass
validatePriceIncrement(1000, 'Filter Coffee');
validatePriceIncrement(23000, 'Melbourne Magic');
validatePriceIncrement(22000, 'Pistachio Croissant');
validatePriceIncrement(34000, 'Raspberry NY Roll');
assert(true, 'Multiples of 1,000 paise (₹10, ₹220, ₹230, ₹340) pass validation');

// Non-multiples throw InvalidPriceIncrementError
assertThrows(
  () => validatePriceIncrement(23500, 'Odd Price Coffee'),
  'ERR_CFR_INVALID_PRICE_INCREMENT',
  'Throws on ₹235 (not a ₹10 multiple)'
);

assertThrows(
  () => validatePriceIncrement(22100, 'Odd Price Croissant'),
  'ERR_CFR_INVALID_PRICE_INCREMENT',
  'Throws on ₹221 (not a ₹10 multiple)'
);

assertThrows(
  () => validatePriceIncrement(0, 'Zero Price'),
  'ERR_CFR_INVALID_PRICE_INCREMENT',
  'Throws on ₹0'
);

console.log('\n--- Test Suite 2: Haryana 5% GST & Golden Fixture Invariants ---');

// GOLDEN FIXTURE TEST:
// Item 1: ₹230 (23,000 paise) + Item 2: ₹220 (22,000 paise) = ₹450.00 taxable (45,000 paise)
const taxableGolden = 45000;
const gst = calculateHaryanaGst(taxableGolden);

assert(gst.taxable_paise === 45000, 'Golden Fixture: Taxable subtotal is 45,000 paise (₹450.00)');
assert(gst.cgst_rate === 2.5, 'Golden Fixture: CGST rate is 2.5%');
assert(gst.sgst_rate === 2.5, 'Golden Fixture: SGST rate is 2.5%');
assert(gst.cgst_paise === 1125, 'Golden Fixture: CGST is 1,125 paise (₹11.25)');
assert(gst.sgst_paise === 1125, 'Golden Fixture: SGST is 1,125 paise (₹11.25)');
assert(gst.total_tax_paise === 2250, 'Golden Fixture: Total GST is 2,250 paise (₹22.50)');
assert(gst.raw_total_paise === 47250, 'Golden Fixture: Raw total is 47,250 paise (₹472.50)');
assert(gst.round_off_paise === 50, 'Golden Fixture: Round-off is +50 paise (+₹0.50)');
assert(gst.payable_paise === 47300, 'Golden Fixture: Net Payable is strictly 47,300 paise (₹473.00)');
assert(gst.sac_code === '996331', 'Golden Fixture: SAC Code is 996331 (Restaurant Service)');
assert(formatRupees(gst.payable_paise) === '₹473.00', 'FormatRupees outputs ₹473.00');

// Exact rupee case (zero roundoff)
const gstExact = calculateHaryanaGst(20000); // ₹200 -> CGST ₹5, SGST ₹5 -> ₹210.00
assert(gstExact.total_tax_paise === 1000, '₹200 order has exactly ₹10 total tax');
assert(gstExact.round_off_paise === 0, '₹200 order has 0 round-off');
assert(gstExact.payable_paise === 21000, '₹200 order payable is ₹210.00');

console.log('\n--- Test Suite 3: Indian Financial Year Calculation ---');

// Oct 29, 2026 -> FY 26-27
const dateMidYear = new Date('2026-10-29T12:00:00Z');
assert(getFinancialYear(dateMidYear) === '26-27', '2026-10-29 belongs to FY 26-27');

// Mar 31, 2027 -> FY 26-27 (Last day of FY)
const dateLastDay = new Date('2027-03-31T12:00:00Z');
assert(getFinancialYear(dateLastDay) === '26-27', '2027-03-31 belongs to FY 26-27');

// Apr 1, 2027 -> FY 27-28 (First day of new FY)
const dateNewYear = new Date('2027-04-01T04:00:00Z');
assert(getFinancialYear(dateNewYear) === '27-28', '2027-04-01 belongs to FY 27-28');

console.log('\n--- Test Suite 4: Gap-Free Sequential Invoicing in SQLite ---');

const testDb = new Database(':memory:');
testDb.pragma('foreign_keys = ON');
runCfrMigrations(testDb);

// Issue Invoice 1
const res1 = issueCfrInvoice(testDb, {
  order_id: 'ord_101',
  taxable_paise: 45000,
  payment_method: 'UPI_DYNAMIC',
  payment_ref: 'UTR99887766',
  custom_date: dateMidYear,
});
assert(res1.invoice.invoice_number === 'CFR/26-27/000001', 'First invoice is CFR/26-27/000001');
assert(res1.invoice.payable_paise === 47300, 'First invoice amount is ₹473.00');

// Issue Invoice 2
const res2 = issueCfrInvoice(testDb, {
  order_id: 'ord_102',
  taxable_paise: 20000,
  payment_method: 'CASH',
  custom_date: dateMidYear,
});
assert(res2.invoice.invoice_number === 'CFR/26-27/000002', 'Second invoice is CFR/26-27/000002 (gap-free)');

// Issue Invoice 3
const res3 = issueCfrInvoice(testDb, {
  order_id: 'ord_103',
  taxable_paise: 30000,
  payment_method: 'CARD',
  custom_date: dateMidYear,
});
assert(res3.invoice.invoice_number === 'CFR/26-27/000003', 'Third invoice is CFR/26-27/000003 (gap-free)');

// Test FY Rollover: New invoice on April 1, 2027 resets sequence to 000001 for FY 27-28
const resRollover = issueCfrInvoice(testDb, {
  order_id: 'ord_201',
  taxable_paise: 45000,
  payment_method: 'UPI_DYNAMIC',
  custom_date: dateNewYear,
});
assert(resRollover.invoice.invoice_number === 'CFR/27-28/000001', 'FY Rollover creates CFR/27-28/000001 resetting sequence counter');

console.log('\n--- Test Suite 5: Credit Notes on Invoice Void ---');

// Void Invoice 1
const cn = issueCfrCreditNote(testDb, {
  invoice_id: res1.invoice.id,
  reason: 'Guest spilled coffee, bill refunded and re-entered',
  custom_date: dateMidYear,
});

assert(cn.credit_note_number === 'CN/26-27/000001', 'Credit note is CN/26-27/000001');
assert(cn.amount_paise === 47300, 'Credit note amount matches original invoice payable (₹473.00)');
assert(cn.original_invoice_number === 'CFR/26-27/000001', 'Credit note references original invoice number');

// Verify original invoice status updated to CREDIT_NOTE_ISSUED
const updatedInv = testDb.prepare('SELECT status FROM cfr_invoices WHERE id = ?').get(res1.invoice.id) as { status: string };
assert(updatedInv.status === 'CREDIT_NOTE_ISSUED', 'Original invoice status is now CREDIT_NOTE_ISSUED');

// Attempting to void the same invoice again throws an error
assertThrows(
  () =>
    issueCfrCreditNote(testDb, {
      invoice_id: res1.invoice.id,
      reason: 'Second void attempt',
    }),
  'already been voided',
  'Cannot void an invoice twice'
);

console.log('\n--- Test Suite 6: Thermal Receipt Text Generation ---');

const items: ReceiptItem[] = [
  { name: 'Melbourne Magic', quantity: 1, rate_paise: 23000, amount_paise: 23000 },
  { name: 'Pistachio Croissant', quantity: 1, rate_paise: 22000, amount_paise: 22000 },
];

const receiptText = generateThermalReceiptText(res1.invoice, res1.gst, items);

assert(receiptText.includes('COFFEE FIRST RITUAL'), 'Receipt includes COFFEE FIRST RITUAL header');
assert(receiptText.includes('GSTIN: 06AABCC1234D1Z5'), 'Receipt includes GSTIN');
assert(receiptText.includes('FSSAI Lic: 10826999000123'), 'Receipt includes FSSAI number');
assert(receiptText.includes('Invoice: CFR/26-27/000001'), 'Receipt includes invoice number');
assert(receiptText.includes('SAC: 996331'), 'Receipt includes SAC Code 996331');
assert(receiptText.includes('Melbourne Magic'), 'Receipt lists Melbourne Magic');
assert(receiptText.includes('Pistachio Croissant'), 'Receipt lists Pistachio Croissant');
assert(/CGST\s*@\s*2\.5%:\s*₹11\.25/.test(receiptText), 'Receipt shows CGST @ 2.5% ₹11.25');
assert(/SGST\s*@\s*2\.5%:\s*₹11\.25/.test(receiptText), 'Receipt shows SGST @ 2.5% ₹11.25');
assert(/Round-off:\s*\+₹0\.50/.test(receiptText), 'Receipt shows Round-off +₹0.50');
assert(/TOTAL PAYABLE.*₹473\.00/.test(receiptText), 'Receipt shows TOTAL PAYABLE (INR): ₹473.00');
assert(receiptText.includes('100% ARTISANAL EGGLESS & PURE VEGETARIAN'), 'Receipt has mandatory eggless footer');

testDb.close();

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${total} assertions.`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All Week 2 GST & Invoicing invariants PASSED cleanly!\n');
}
