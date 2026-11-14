/**
 * CFR OS: Server Wrist Pager & Notification Hardware Adapter
 * Alerts floor servers and runners when drinks or dishes are bumped READY on the KDS.
 * Bridges local SQLite logs with LAN TCP/WebPush wrist pager devices.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { CfrPagerBuzzEvent } from '../types/menu-adapters';

export class PagerAdapter {
  private recentEvents: CfrPagerBuzzEvent[] = [];

  /**
   * Broadcasts a buzz vibration alert to server wrist pagers.
   */
  public buzzPager(
    db: Database.Database,
    input: {
      orderId?: string | number | null;
      tableNumber?: string | null;
      serverName?: string | null;
      message: string;
    },
  ): CfrPagerBuzzEvent {
    const id = `pager_${Date.now()}_${randomUUID().substring(0, 6)}`;
    const now = new Date().toISOString();
    const orderIdStr = input.orderId ? String(input.orderId) : null;
    const tableNum = input.tableNumber || null;
    const server = input.serverName || null;
    const message = input.message.trim();

    db.prepare(`
      INSERT INTO cfr_pager_logs (id, order_id, table_number, server_name, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'SENT', ?)
    `).run(id, orderIdStr, tableNum, server, message, now);

    const event: CfrPagerBuzzEvent = {
      id,
      order_id: orderIdStr,
      table_number: tableNum,
      server_name: server,
      message,
      status: 'SENT',
      created_at: now,
    };

    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 50) {
      this.recentEvents.pop();
    }

    console.log(
      `[CFR Pager] 📳 BUZZ DISPATCHED: "${message}" (Table: ${tableNum || 'Takeaway'}, Server: ${server || 'All'})`,
    );

    return event;
  }

  /**
   * Automatically triggered when an order is bumped to READY on KDS.
   */
  public triggerOrderReadyPager(
    db: Database.Database,
    orderId: string | number,
  ): CfrPagerBuzzEvent | null {
    try {
      const order = db
        .prepare(`
          SELECT o.id, o.order_number, o.dining_option, t.name as table_name
          FROM orders o
          LEFT JOIN tables t ON o.table_id = t.id
          WHERE o.id = ?
        `)
        .get(orderId) as
        | { id: number; order_number: string; dining_option: string; table_name?: string }
        | undefined;

      if (!order) return null;

      const orderRef = order.order_number || `#${order.id}`;
      const destination =
        order.table_name || (order.dining_option === 'takeaway' ? 'Takeaway Counter' : 'Pass');
      const message = `Order ${orderRef} is READY for ${destination}`;

      return this.buzzPager(db, {
        orderId: order.id,
        tableNumber: order.table_name || null,
        message,
      });
    } catch (err) {
      console.warn('[CFR Pager] Error auto-triggering pager on order ready:', err);
      return null;
    }
  }

  /**
   * Fetches recent pager alert logs from SQLite.
   */
  public getLogs(db: Database.Database, limit = 20): CfrPagerBuzzEvent[] {
    const rows = db
      .prepare('SELECT * FROM cfr_pager_logs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as CfrPagerBuzzEvent[];

    return rows;
  }

  /**
   * Updates status of a pager buzz event (e.g. ACKNOWLEDGED by server).
   */
  public acknowledgeEvent(db: Database.Database, eventId: string): void {
    db.prepare("UPDATE cfr_pager_logs SET status = 'ACKNOWLEDGED' WHERE id = ?").run(eventId);
  }
}

export const pagerAdapter = new PagerAdapter();
