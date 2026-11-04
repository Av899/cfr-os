/**
 * CFR OS: Week 3 Automated Test Suite
 * Dynamic UPI QR Generator, 12-Digit UTR Validation, and Dual-Track Reconciliation
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-upi-payments.test.ts
 */

import Database from 'better-sqlite3';
import {
  generateUpiUri,
  generateUpiQr,
  isValidUtr,
  normalizeUtr,
  DEFAULT_UPI_CONFIG,
} from '../main/cfr/payments/upi-qr';
import {
  createPaymentRecord,
  reconcileManualUtr,
  reconcileGatewayPayment,
  getPendingReconciliations,
  InvalidUtrError,
} from '../main/cfr/payments/reconciler';
import { runCfrMigrations } from '../main/cfr/db/migrator';

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
    if (err.code === expectedCode || err.name === 'InvalidUtrError' || String(err).includes(expectedCode)) {
      passed++;
      console.log(`  ✓ ${label} (caught expected ${expectedCode})`);
    } else {
      failed++;
      console.error(`  ✗ ${label} — unexpected error: ${err.message || err}`);
    }
  }
}

async function run() {
  console.log('\n--- Test Suite 1: NPCI Dynamic UPI URI Generation ---');

  // ₹473.00 = 47,300 paise
  const upi = generateUpiUri({
    amountPaise: 47300,
    orderId: 'ord_101',
    invoiceNumber: 'CFR/26-27/000042',
  });

  assert(upi.uri.startsWith('upi://pay?'), 'URI starts with upi://pay?');
  assert(upi.uri.includes('pa=cfrcoffee%40icici') || upi.uri.includes(encodeURIComponent(DEFAULT_UPI_CONFIG.vpa)), 'URI contains payee VPA');
  assert(upi.uri.includes('pn=CFR%20Coffee') || upi.uri.includes(encodeURIComponent(DEFAULT_UPI_CONFIG.payeeName)), 'URI contains payee name');
  assert(upi.uri.includes('am=473.00'), 'URI formats amount strictly as ₹473.00');
  assert(upi.uri.includes('cu=INR'), 'URI specifies cu=INR');
  assert(upi.uri.includes('tr='), 'URI includes unique transaction reference');
  assert(upi.uri.includes('mc=5812'), 'URI includes restaurant MCC 5812');

  // Amount validation
  assertThrows(
    () => generateUpiUri({ amountPaise: -100, orderId: 'ord_err' }),
    'Invalid UPI amount',
    'Throws error on negative paise'
  );

  assertThrows(
    () => generateUpiUri({ amountPaise: 473.5, orderId: 'ord_err' }),
    'Invalid UPI amount',
    'Throws error on floating point paise'
  );

  console.log('\n--- Test Suite 2: 12-Digit Indian Bank UTR Validation ---');

  // Valid 12-digit UTRs
  assert(isValidUtr('430489123456'), 'Valid 12-digit numeric UTR accepted');
  assert(isValidUtr('AXIS43048912'), 'Valid 12-character alphanumeric bank reference accepted');
  assert(isValidUtr('UTR: 430489123456'), 'UTR with prefix is validated after normalization');
  assert(isValidUtr('UPI: 430489123456'), 'UPI prefix is validated after normalization');
  assert(normalizeUtr('utr: 430489123456') === '430489123456', 'normalizeUtr strips prefix cleanly');
  assert(normalizeUtr('upi: 430489123456') === '430489123456', 'normalizeUtr strips upi prefix cleanly');

  // Invalid UTRs
  assert(!isValidUtr(''), 'Empty string is rejected');
  assert(!isValidUtr('12345'), 'Short UTR (<12 digits) is rejected');
  assert(!isValidUtr('12345678901234567'), 'Long UTR (>12 digits) is rejected');
  assert(!isValidUtr('000000000000'), 'Dummy repeated zeros rejected');
  assert(!isValidUtr('111111111111'), 'Dummy repeated ones rejected');

  console.log('\n--- Test Suite 3: Dynamic QR Code Generation ---');

  const qrResult = await generateUpiQr({
    amountPaise: 47300,
    orderId: 'ord_101',
    invoiceNumber: 'CFR/26-27/000042',
  });

  assert(qrResult.qrDataUrl.startsWith('data:image/png;base64,'), 'QR data URL is valid Base64 PNG');
  assert(qrResult.amountPaise === 47300, 'QR result matches exact paise');
  assert(qrResult.amountRupees === '473.00', 'QR result rupee string is 473.00');
  assert(new Date(qrResult.expiresAt).getTime() > Date.now(), 'QR has future expiration timestamp');

  console.log('\n--- Test Suite 4: SQLite Dual-Track Payment Reconciler ---');

  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  runCfrMigrations(testDb);

  // 1. Dynamic UPI initiation (starts as PENDING_RECONCILIATION)
  const upiPay = createPaymentRecord(testDb, {
    order_id: 'ord_201',
    method: 'UPI_DYNAMIC',
    amount_paise: 47300,
    upi_uri: qrResult.uri,
  });

  assert(upiPay.status === 'PENDING_RECONCILIATION', 'UPI payment starts as PENDING_RECONCILIATION');
  assert(upiPay.amount_paise === 47300, 'Payment amount stored as 47,300 paise');

  // Check pending reconciliations list
  let pendingList = getPendingReconciliations(testDb);
  assert(pendingList.length === 1, 'Pending reconciliations list count is 1');
  assert(pendingList[0].id === upiPay.id, 'Pending item matches created payment ID');

  // 2. Cash payment (instantly CONFIRMED)
  const cashPay = createPaymentRecord(testDb, {
    order_id: 'ord_202',
    method: 'CASH',
    amount_paise: 22000,
  });
  assert(cashPay.status === 'CONFIRMED', 'Cash payment is immediately CONFIRMED');

  // 3. Offline Manual UTR Reconciliation (WAN down scenario)
  const reconciledUpi = reconcileManualUtr(testDb, {
    payment_id: upiPay.id,
    utr: '430489123456',
  });

  assert(reconciledUpi.status === 'CONFIRMED', 'Payment transitioned to CONFIRMED on valid UTR');
  assert(reconciledUpi.utr_ref === '430489123456', 'UTR reference stored cleanly');
  assert(reconciledUpi.reconciled_at !== null, 'Reconciled timestamp recorded');

  // Verify pending list is now empty
  pendingList = getPendingReconciliations(testDb);
  assert(pendingList.length === 0, 'Pending reconciliations list is now 0');

  // 4. Invalid UTR rejection
  assertThrows(
    () =>
      reconcileManualUtr(testDb, {
        order_id: 'ord_999',
        utr: 'bad_utr',
      }),
    'ERR_CFR_INVALID_UTR',
    'Reconciler throws InvalidUtrError on invalid UTR'
  );

  // 5. Automated gateway webhook reconciliation
  const gatewayPay = createPaymentRecord(testDb, {
    order_id: 'ord_301',
    method: 'UPI_DYNAMIC',
    amount_paise: 34000,
  });

  const webhookReconciled = reconcileGatewayPayment(testDb, {
    payment_id: gatewayPay.id,
    gateway_payment_id: 'pay_rzp_test_123456',
    status: 'CONFIRMED',
  });

  assert(webhookReconciled.status === 'CONFIRMED', 'Gateway webhook sets status to CONFIRMED');
  assert(webhookReconciled.gateway_payment_id === 'pay_rzp_test_123456', 'Gateway payment ID stored');

  testDb.close();

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${total} assertions.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All Week 3 UPI & Reconciliation invariants PASSED cleanly!\n');
  }
}

run().catch((err) => {
  console.error('Fatal error in Week 3 test suite:', err);
  process.exit(1);
});
