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

## Seam 009: POS Auto-Print Bill, Popup-Safe Printing & Store Details Logo Display

- **Target Files**:
  - `frontend/src/app/(dashboard)/pos/page.tsx` (~lines 2293-2297)
  - `frontend/src/app/(dashboard)/settings/page.tsx` (~lines 3546, 3598-3603)
  - `frontend/src/components/pos/PaymentModal.tsx` (~lines 16, 187-202, 1218, 2288-2296)
  - `frontend/src/hooks/usePrinter.ts` (~lines 344, 444, 627)
  - `frontend/src/lib/printer/web-print.ts` (~lines 121-175, 208-275)
  - `frontend/src/lib/printer/PrinterService.ts` (~lines 314-387, 401-404)
  - `frontend/src/store/pos-settings.ts` (~lines 170, 298, 369, 407-417)
  - `frontend/src/lib/printer/warnings.ts` (~line 197)
  - `main/routes/settings.ts` (~lines 518-523)
- **Date**: 2026-11-05
- **Purpose**:
  1. Fixes bill printing failure on payment completion by passing `force = true` when `autoPrintBill` is enabled.
  2. Solves browser popup blocker issues where `window.open` after async payment network calls is blocked, by adding a reliable offscreen `<iframe>` fallback (`printHtmlViaHiddenIframe`).
  3. Fixes receipt logo not displaying on the bill:
     - Waits for document images/data URIs to finish loading and decoding before invoking `.print()`.
     - Ensures offscreen iframe is properly styled (`left: -9999px; width: 800px; height: 600px; opacity: 0`) rather than `visibility: hidden; width: 0; height: 0`, preventing browsers from suppressing image decoding.
     - Guarantees store logo uploaded in Store Details (`receiptLogo`) automatically enables `billShowLogo: true` and is reliably passed to bill documents.
  4. Adds explicit, user-facing "Print Bill" / "Reprint Bill" action button directly in the `PaymentModal` post-payment confirmation screen.
  5. Sets default store setting `autoPrintBill: true` with persistent migration to version 7 so bills print automatically after checkout.
  6. Eliminates duplicate printing by removing the redundant print trigger from `handlePaymentComplete` when clicking "Done"; the bill prints once upon payment success and provides on-demand reprint if needed.
  7. Eliminates lingering popup windows by automatically closing the `about:blank` print popup (`printWindow.close()`) immediately after the print dialog is completed or cancelled, preventing orphaned windows with `<button>Print Bill</button>` from staying on the desktop.
- **Upstream Risk**: Zero. Thermal printer ESC/POS printing is completely untouched; web/browser printing waits for image decode and falls back to offscreen iframe when `window.open` is blocked.

---

## Seam 010: Removal of "Powered by FloPOS" Receipt Branding

- **Target Files**:
  - `frontend/src/lib/printer/branding.ts` (lines 1-3)
  - `frontend/src/lib/printer/web-print.ts` (line 574)
  - `frontend/src/lib/printer/receipt-encoder.ts` (lines 208-210)
  - `frontend/src/lib/printer/tax-bill-encoder.ts` (lines 88-90)
  - `main/printers/formatting-helpers.ts` (lines 34, 486-488)
  - `main/printers/document-menu.ts` (line 142)
- **Date**: 2026-11-05
- **Purpose**: Strips the hardcoded "Powered by FloPOS (flopos.com)" and "Powered by FloCafe" branding from the receipt and bill footers across both web-print (browser HTML) and thermal ESC/POS byte encoders.
- **Upstream Risk**: Zero. Conditional checks guard the footer lines; when empty, no empty lines or branding tags are appended.

---

## Seam 011: CFR Gram-Level BOM & FEFO Inventory Engine (Week 4)

- **Target Files**:
  - `main/routes/orders.ts` (lines 2106-2113, 5381-5388)
  - `main/cfr/inventory/fefo.ts`
  - `main/cfr/inventory/bom.ts`
  - `main/cfr/types/inventory.ts`
  - `main/cfr/routes/cfr-router.ts` (lines 540-690)
  - `main/cfr/db/migrator.ts` (lines 337-343)
- **Date**: 2026-11-05
- **Purpose**:
  1. Integrates gram-level Bill of Materials (BOM) deduction into order lifecycle: when an order is created, all leaf ingredients (coffee beans, milk, flour, butter) are automatically resolved (including recursive sub-recipes and addon substitutions) and deducted.
  2. Implements First-Expiry, First-Out (FEFO) stock allocation: stock lots with the earliest expiry dates are consumed first across batches.
  3. Reverses inventory deductions automatically if an order is cancelled or voided.
  4. Provides REST API endpoints for stock levels, lot receiving, and zero-revenue barista waste/dial-in logging (`/api/cfr/inventory/*`).
- **Upstream Risk**: Zero. FloCafe's standard order processing continues uninterrupted; BOM deductions run asynchronously in safe try-catch blocks without blocking transactions.



