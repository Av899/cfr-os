/**
 * CFR KDS Order Status Synchronizer
 *
 * Propagates kitchen item status changes back to the parent order.
 * Ensures Customer Display (and POS orders view) immediately reflect when
 * an order transitions between pending, preparing, ready, and served.
 *
 * Invariants:
 * - Never mutates terminal orders ('completed', 'cancelled').
 * - Only evaluates active, non-voided order items.
 * - An order is 'ready' when ALL active items are 'ready' or 'served' (with at least one 'ready').
 * - An order is 'preparing' when at least one active item is 'preparing' or 'ready' (while others remain 'pending').
 * - An order is 'served' when ALL active items are 'served'.
 * - An order is 'pending' when ALL active items are 'pending'.
 */

import { now } from '../../db';

export type SyncedOrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | null;

export function syncParentOrderStatus(db: any, orderId: number | string): SyncedOrderStatus {
  if (!orderId) return null;

  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId) as
    | { id: number; status: string }
    | undefined;

  if (!order) return null;

  // Never overwrite terminal states
  if (order.status === 'completed' || order.status === 'cancelled') {
    return order.status as SyncedOrderStatus;
  }

  const items = db
    .prepare(
      `SELECT status FROM order_items
       WHERE order_id = ?
         AND status NOT IN ('voided', 'void_adjustment', 'cancelled', 'refunded')`,
    )
    .all(orderId) as Array<{ status: string }>;

  if (items.length === 0) {
    return order.status as SyncedOrderStatus;
  }

  const allServed = items.every((i) => i.status === 'served');
  const allReadyOrServed = items.every((i) => i.status === 'ready' || i.status === 'served');
  const hasPreparing = items.some((i) => i.status === 'preparing');
  const hasReady = items.some((i) => i.status === 'ready');

  let nextStatus: 'pending' | 'preparing' | 'ready' | 'served';
  if (allServed) {
    nextStatus = 'served';
  } else if (allReadyOrServed) {
    nextStatus = 'ready';
  } else if (hasPreparing || hasReady) {
    nextStatus = 'preparing';
  } else {
    nextStatus = 'pending';
  }

  if (nextStatus !== order.status) {
    const timestamp = now();
    if (nextStatus === 'ready') {
      db.prepare(
        `UPDATE orders
         SET status = 'ready', ready_at = COALESCE(ready_at, ?), updated_at = ?
         WHERE id = ? AND status NOT IN ('completed', 'cancelled')`,
      ).run(timestamp, timestamp, orderId);

      // CFR Hardware Adapter: Buzz server wrist pagers when order is ready
      try {
        const { pagerAdapter } = require('../adapters/pager-adapter');
        pagerAdapter.triggerOrderReadyPager(db, orderId);
      } catch (pagerErr) {
        console.warn('[CFR Pager] Failed to auto-buzz server pager:', pagerErr);
      }
    } else if (nextStatus === 'preparing') {
      db.prepare(
        `UPDATE orders
         SET status = 'preparing', cooking_started_at = COALESCE(cooking_started_at, ?), updated_at = ?
         WHERE id = ? AND status NOT IN ('completed', 'cancelled')`,
      ).run(timestamp, timestamp, orderId);
    } else if (nextStatus === 'served') {
      db.prepare(
        `UPDATE orders
         SET status = 'served', served_at = COALESCE(served_at, ?), updated_at = ?
         WHERE id = ? AND status NOT IN ('completed', 'cancelled')`,
      ).run(timestamp, timestamp, orderId);
    } else if (nextStatus === 'pending') {
      db.prepare(
        `UPDATE orders
         SET status = 'pending', updated_at = ?
         WHERE id = ? AND status NOT IN ('completed', 'cancelled')`,
      ).run(timestamp, orderId);
    }
  }

  return nextStatus;
}

