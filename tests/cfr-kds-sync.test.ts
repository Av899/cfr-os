import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfr-kds-sync-test-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const { initDatabase, closeDatabase, getDatabase, now } = require('../main/db');
const { syncParentOrderStatus } = require('../main/cfr/kds/sync');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function run() {
  console.log('Testing CFR KDS Order Status Synchronizer...');
  initDatabase();
  const db = getDatabase();

  try {
    // 1. Setup sample products and categories
    db.prepare("INSERT INTO categories (id, name, sort_order) VALUES ('cat-coffee', 'Coffee', 1)").run();
    db.prepare("INSERT INTO categories (id, name, sort_order) VALUES ('cat-bakery', 'Bakery', 2)").run();
    db.prepare("INSERT INTO products (id, category_id, name, price, is_active) VALUES ('prod-latte', 'cat-coffee', 'Vanilla Latte', 220, 1)").run();
    db.prepare("INSERT INTO products (id, category_id, name, price, is_active) VALUES ('prod-croissant', 'cat-bakery', 'Almond Croissant', 180, 1)").run();

    // 2. Scenario A: Single item order transitions: pending -> preparing -> ready -> served
    db.prepare(`
      INSERT INTO orders (id, order_number, type, status, subtotal, total, created_at, updated_at)
      VALUES (101, 'CFR-101', 'dine_in', 'pending', 220, 220, ?, ?)
    `).run(now(), now());
    db.prepare(`
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal, total, status, created_at, updated_at)
      VALUES (1001, 101, 'prod-latte', 'Vanilla Latte', 220, 1, 220, 220, 'pending', ?, ?)
    `).run(now(), now());

    let status = syncParentOrderStatus(db, 101);
    assert(status === 'pending', 'Order with 1 pending item stays pending');

    // Mark item preparing
    db.prepare("UPDATE order_items SET status = 'preparing' WHERE id = 1001").run();
    status = syncParentOrderStatus(db, 101);
    assert(status === 'preparing', 'Order transitions to preparing when item starts cooking');
    let orderRow = db.prepare('SELECT status, cooking_started_at FROM orders WHERE id = 101').get() as any;
    assert(orderRow.status === 'preparing', 'DB orders.status is preparing');
    assert(!!orderRow.cooking_started_at, 'DB orders.cooking_started_at is set');

    // Mark item ready
    db.prepare("UPDATE order_items SET status = 'ready' WHERE id = 1001").run();
    status = syncParentOrderStatus(db, 101);
    assert(status === 'ready', 'Order transitions to ready when item is marked ready');
    orderRow = db.prepare('SELECT status, ready_at FROM orders WHERE id = 101').get() as any;
    assert(orderRow.status === 'ready', 'DB orders.status is ready for Customer Display');
    assert(!!orderRow.ready_at, 'DB orders.ready_at is set');

    // Mark item served
    db.prepare("UPDATE order_items SET status = 'served' WHERE id = 1001").run();
    status = syncParentOrderStatus(db, 101);
    assert(status === 'served', 'Order transitions to served when item is served');
    orderRow = db.prepare('SELECT status, served_at FROM orders WHERE id = 101').get() as any;
    assert(orderRow.status === 'served', 'DB orders.status is served');
    assert(!!orderRow.served_at, 'DB orders.served_at is set');

    // 3. Scenario B: Multi-item order:
    // Coffee + Croissant
    db.prepare(`
      INSERT INTO orders (id, order_number, type, status, subtotal, total, created_at, updated_at)
      VALUES (102, 'CFR-102', 'takeaway', 'pending', 400, 400, ?, ?)
    `).run(now(), now());
    db.prepare(`
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal, total, status, created_at, updated_at)
      VALUES (1002, 102, 'prod-latte', 'Vanilla Latte', 220, 1, 220, 220, 'pending', ?, ?)
    `).run(now(), now());
    db.prepare(`
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal, total, status, created_at, updated_at)
      VALUES (1003, 102, 'prod-croissant', 'Almond Croissant', 180, 1, 180, 180, 'pending', ?, ?)
    `).run(now(), now());

    // Barista marks Coffee ready, Croissant still pending
    db.prepare("UPDATE order_items SET status = 'ready' WHERE id = 1002").run();
    status = syncParentOrderStatus(db, 102);
    assert(status === 'preparing', 'Order with 1 ready and 1 pending item is preparing (not ready yet)');

    // Baker marks Croissant ready
    db.prepare("UPDATE order_items SET status = 'ready' WHERE id = 1003").run();
    status = syncParentOrderStatus(db, 102);
    assert(status === 'ready', 'Order with all items ready transitions to ready');

    // Barista accidentally marked ready, moves Croissant back to preparing
    db.prepare("UPDATE order_items SET status = 'preparing' WHERE id = 1003").run();
    status = syncParentOrderStatus(db, 102);
    assert(status === 'preparing', 'Order rolls back from ready to preparing when an item returns to preparing');

    // Baker completes Croissant again
    db.prepare("UPDATE order_items SET status = 'ready' WHERE id = 1003").run();
    status = syncParentOrderStatus(db, 102);
    assert(status === 'ready', 'Order transitions back to ready');

    // 4. Scenario C: Voided items do not block order readiness
    db.prepare(`
      INSERT INTO orders (id, order_number, type, status, subtotal, total, created_at, updated_at)
      VALUES (103, 'CFR-103', 'takeaway', 'pending', 400, 400, ?, ?)
    `).run(now(), now());
    db.prepare(`
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal, total, status, created_at, updated_at)
      VALUES (1004, 103, 'prod-latte', 'Vanilla Latte', 220, 1, 220, 220, 'ready', ?, ?)
    `).run(now(), now());
    db.prepare(`
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal, total, status, created_at, updated_at)
      VALUES (1005, 103, 'prod-croissant', 'Almond Croissant', 180, 1, 180, 180, 'voided', ?, ?)
    `).run(now(), now());

    status = syncParentOrderStatus(db, 103);
    assert(status === 'ready', 'Order with 1 ready item and 1 voided item transitions to ready');

    // 5. Scenario D: Terminal states are preserved
    db.prepare("UPDATE orders SET status = 'completed' WHERE id = 101").run();
    db.prepare("UPDATE order_items SET status = 'pending' WHERE id = 1001").run();
    status = syncParentOrderStatus(db, 101);
    assert(status === 'completed', 'Completed order status is never overwritten');

    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = 102").run();
    db.prepare("UPDATE order_items SET status = 'ready' WHERE id = 1002").run();
    status = syncParentOrderStatus(db, 102);
    assert(status === 'cancelled', 'Cancelled order status is never overwritten');

    console.log('✅ All CFR KDS Order Status Synchronizer tests passed successfully!');
  } finally {
    closeDatabase();
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
