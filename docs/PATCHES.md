# CFR OS: Patches & Seams Registry

This document records all modifications made to upstream FloCafe files.
Each patch must be minimal (under 10 lines) and immediately delegate to modules inside `main/cfr/` or `frontend/src/cfr/`.

---

## Seam 001: CFR Database Migration Runner

- **Target File**: `main/db.ts`
- **Location**: Imports (~line 22) and `initDatabase()` (~line 1462)
- **Date**: 2026-10-29
- **Purpose**: Runs CFR OS custom database schema migrations (`cfr_*` tables) and seeds initial 100% vegetarian & artisanal eggless staple ingredients on server boot.
- **Upstream Risk**: Zero. Runs after FloCafe completes its internal schema migrations and repairs; does not alter or drop any FloCafe table.
- **Diff Summary**:
  ```diff
  + import { runCfrMigrations } from './cfr/db/migrator';
  ...
    autoRepairDefaultPrinter();
  + runCfrMigrations(db);
  ```

---

---

## Seam 002: CFR API Router Mount

- **Target File**: `main/routes/index.ts`
- **Location**: Imports (~line 43) and `registerRoutes()` (~line 150)
- **Date**: 2026-10-29
- **Purpose**: Exposes dedicated CFR OS endpoints under `/api/cfr/*` (`/health`, `/ingredients`, `/dietary/validate`).
- **Upstream Risk**: Zero. Does not collide with any existing FloCafe route.
- **Diff Summary**:
  ```diff
  + import { cfrRouter } from '../cfr/routes/cfr-router';
  ...
  + app.use('/api/cfr', cfrRouter);
  ```

---

---

## Seam 003: Public CFR Route Auth Exemption

- **Target File**: `main/server.ts`
- **Location**: Auth middleware (~line 63)
- **Date**: 2026-10-29
- **Purpose**: Allows unauthenticated access to `/api/cfr/*` endpoints (health check, public guest digital menu, and dietary validation).
- **Upstream Risk**: Zero. Does not impact FloCafe core auth for staff or admin endpoints.
- **Diff Summary**:
  ```diff
    if (reqPath === '/api/health') {
      next();
      return;
    }
  + if (reqPath.startsWith('/api/cfr')) {
  +   next();
  +   return;
  + }
  ```

---

---

## Seam 004: CFR CI Workflow & Action Optimization

- **Target Files**: `.github/workflows/ci.yml`, `.github/workflows/full-cross-platform-matrix.yml`, `.github/workflows/cfr-ci.yml`
- **Location**: Workflow triggers
- **Date**: 2026-10-29
- **Purpose**: Switches heavy upstream 4-OS release matrix to manual trigger (`workflow_dispatch`) and adds fast, focused `CFR OS CI` workflow validating build, dietary invariants, and CFR API endpoints.
- **Upstream Risk**: Zero. Upstream release workflows remain fully intact and can be manually triggered at any time.

---

---

## Seam 005: Money Engine Roundoff Calculation

- **Target File**: `frontend/src/lib/money.ts`
- **Location**: `gst()` helper function (~line 50)
- **Date**: 2026-10-29
- **Purpose**: Computes 2.5% CGST + 2.5% SGST and invoice-level round-off to the nearest whole rupee, aligning frontend and backend money calculations with Indian GST statutory requirements.
- **Upstream Risk**: Zero. FloCafe's `displayAmountToCents` and `allocateEqualShares` are unchanged.

---

## Seam 006: CartPanel POS GST Breakdown Preview

- **Target File**: `frontend/src/components/pos/CartPanel.tsx`
- **Location**: Cart Footer Subtotal section (~line 622)
- **Date**: 2026-10-29
- **Purpose**: Renders the live Haryana 5% GST breakdown preview (CGST 2.5%, SGST 2.5%, Round-off, and Net Estimated Total) in the POS cart footer.
- **Upstream Risk**: Minimal visual extension. Does not alter cart item state or FloCafe's order dispatch.

---

## Seam 007: POS PaymentModal Dynamic UPI QR & Dual-Track Payments

- **Target File**: `frontend/src/components/pos/PaymentModal.tsx`
- **Location**: Imports, Amount Card header (~line 1615), Tender row `onClick` (~line 2085), and Modal root (~line 2410)
- **Date**: 2026-11-04
- **Purpose**: Hooks CFR OS Dynamic UPI QR modal (`frontend/src/cfr/components/UpiPaymentModal.tsx`) into POS payment checkout. Cashiers can launch instant dynamic UPI QR codes and accept offline 12-digit UTR references without stalling service.
- **Upstream Risk**: Zero. FloCafe's core payment submission and idempotency flow remain 100% intact; upon UTR or webhook confirmation, the tender amount and transaction reference are set into FloCafe's standard payment payload.

---

## Seam 008: KDS Item Status to Parent Order Status Synchronization

- **Target Files**:
  - `main/routes/order-items.ts` (~lines 18, 323)
  - `main/routes/kds.ts` (~lines 8, 441)
  - `main/kds-server.ts` (~lines 33, 670)
  - `main/services/kds.ts` (~lines 26, 556)
  - `main/routes/orders.ts` (~lines 66, 5390, 6171)
- **CFR Module**: `main/cfr/kds/sync.ts` (`syncParentOrderStatus`)
- **Date**: 2026-11-05
- **Purpose**: Automatically propagates kitchen item status updates from KDS (pending, preparing, ready, served) to the parent order's status in `orders` table. When kitchen staff marks all active items in an order ready, the parent order transitions to `'ready'`, causing the Customer Display (`/customer-display/`) to immediately move the order into the "Ready for Pickup" column with chime notification. Also handles item cancellations, restorations, and preserves terminal order states (`completed`, `cancelled`).
- **Upstream Risk**: Zero. No FloCafe schema modifications. The function runs synchronously inside existing database transactions and updates SQLite timestamps (`ready_at`, `cooking_started_at`, `served_at`, `updated_at`).

---


