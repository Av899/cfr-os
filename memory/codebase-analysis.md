# Codebase Analysis: FloCafe Senior Frontend + Backend + Fullstack

## Project Overview
FloCafe is an **open-source, offline-first Electron desktop POS** system for cafes and restaurants. The architecture follows a clear client-server model with Electron as the desktop wrapper.

### Stack
- **Frontend**: Next.js 16, React 19, Zustand state, shadcn/ui components, Tailwind CSS
- **Backend**: Node.js + Express on port `:3001`, SQLite via `better-sqlite3`
- **KDS**: Standalone server on `:3002`, WebSocket + REST polling
- **Server App**: on `:3003`
- **Desktop mode**: Static Next.js export (`output: 'export'`) when `NEXT_BUILD_MODE=desktop`

## Core Architectural Invariants (from CLAUDE.md)

1. **Offline-first**: Core POS functions without internet; optional network features fail gracefully
2. **Data safety**: Existing customer data survives upgrades; never reset/truncate databases
3. **Architecture boundaries**: UI language, tenant regional settings, and tax/compliance are separate domains
4. **Business timestamps**: Canonical storage with configured store timezone for presentation/shifts/reporting
5. **Backend authority**: Security-critical, payment, and tax calculations remain backend-authoritative
6. **Orders are never ownership-gated**: Any staff role with order access can see/act on any order; authorization is role/action-based, not creator-based
7. **Reuse before adding**: Reuse existing helpers/utilities/dependencies
8. **Scope discipline**: Implement only the approved task

## Frontend Analysis

### Key Files & Structure
- `frontend/src/components/kds/` - KDS workspace, kanban/tab views, login form
- `frontend/src/hooks/useKdsConnection.ts` - WebSocket + REST polling connection management
- `frontend/src/hooks/useKdsView.ts` - View mode (tabs/kanban) stored in localStorage
- `frontend/src/app/(dashboard)/kds/page.tsx` - KDS dashboard page
- `frontend/src/components/CfrInventoryView.tsx` - CFR inventory with FEFO/BOM
- `frontend/src/lib/api.ts` - API client (Axios instance pointing to `:3001`)

### KDS Connection Flow
1. **WebSocket first**: Connect to `ws://localhost:<port>/kds` with auth token
2. **REST fallback**: Poll `/kitchen/orders?status=pending,preparing,ready,served` every 5s
3. **Auth flow**: Login → `/auth/me` → WebSocket login with token
4. **View mode**: Session override > server default > 'tabs' fallback, stored in localStorage

### Authorization
- API routes protected by `requireAuth` middleware (JWT Bearer token)
- Role-based permissions via `requirePermission` middleware
- Administrative permissions: `authorization.manage`, `staff.privileged.manage`, `staff.operational.manage`, `settings.manage`
- **Critical**: No `order.user_id !== user.userId` checks — orders are visibility-gated by role only

### CFR (Cafe/Free Restaurant) Features
- **Week 1**: 100% Vegetarian & Artisanal Eggless Dietary Policy (Strict zero-tolerance guard, SQLite CHECK constraints, flags).
- **Week 2**: Haryana 5% GST (2.5% CGST + 2.5% SGST) + Roundoff, Strict ₹10 Price Increments, Gap-Free Sequential Invoicing (`CFR-2627-XXXXXX`).
- **Week 3**: Dynamic UPI QR Generator & Dual-Track Offline/Online Reconciler (12-digit Indian Bank UTR validation).
- **Week 4**: Gram-Level BOM & FEFO (First-Expiry-First-Out) Inventory Engine (multi-lot cascading, sub-recipes, addon substitutions, waste tracking).
- **Week 5**: Specialty Coffee Freshness & Dial-in Tracking (Roast age `days_off_roast`, degassing curves, barista morning dial-in logger with ratio/flow rate, commercial grinder burr wear & 500kg lifespan alerts, POS topbar freshness pill & dial-in modal).
- **Week 6**: Luxury Guest Digital Menu & Hardware Adapters (Table QR mobile cream paper card with 7 signature sections & craft stories, real-time 86'd availability, Unox Combi preheat & wash checklists, La Marzocco KB90 backflush tracking, server wrist pager auto-buzz on KDS ready, DALI/Lutron & Sonos circadian ambience automation).

## Backend Analysis

### Key Files & Structure
- `main/index.ts` - Electron lifecycle, Express API, KDS, Server App initialization
- `main/server.ts` - Express server with CORS, CSP, auth middleware, static serving
- `main/routes/orders.ts` - Full order CRUD (6000+ lines)
- `main/routes/kitchen-stations.ts` - Kitchen station management
- `main/services/authorization.ts` - Permission resolution system
- `main/middleware/security.ts` - Auth middleware with token revocation/stale detection

### Authorization System
```
JWT Token → requireAuth middleware → resolveEffectivePermissions() → hasPermission() → route guard
```

Key permission concepts:
- **Role defaults**: Shipped-in permissions per role (e.g., chef can manage KDS, owner can manage staff)
- **Role overrides**: Per-role permission modifications in DB
- **User overrides**: Per-user permission modifications in DB
- **Protected rules**: `authorization.manage` and `staff.privileged.manage` only allow `role === 'owner'`

### Order Creation Flow
1. Validation → Item resolution (variants, add-ons, inventory deduction)
2. Tax calculation (backend-authoritative)
3. Stock deduction (inventory service)
4. Recipe application (if applicable)
5. KDS notification via `notifyKdsUpdate()`
6. Cloud sync recording

**Critical invariant**: Orders use `authenticatedUserId` (from JWT), not `order.user_id` for visibility. Any staff with `orders.read` permission can view any order.

### Kitchen Stations
- Managed via `requirePermission('kitchen.stations.manage')`
- Categories assigned per station
- Staff assigned per station (only active chef accounts)
- DELETE requires no assigned tables

### Tax & Compliance
- Tax engine calculates taxes per order
- Country packs for tax rules
- Tax packs can be updated remotely (Google Drive integration)
- Inclusive and exclusive tax types supported

## Fullstack Integration Points

### 1. Order → KDS Pipeline
```
Order creation (POST /api/orders)
  → notifyKdsUpdate() → WebSocket broadcast to /kds
  → KDS workspace receives orders via msg.orders
  → KdsWorkspace renders in tabs or kanban view
  → Staff updates item status → PATCH /order-items/:itemId/status
```

### 2. CFR → Order Pipeline
```
Order creation (POST /api/orders)
  → resolveItemAddons() → addon validation
  → CFR BOM deduction (require('../cfr/inventory/bom').deductOrderBOM)
  → Inventory stock adjustment
  → Recipe snapshot application
```

### 3. Permissions → Feature Gating
```
Role-based permissions control:
  - KDS access (kitchen.stations.manage)
  - CFR inventory access (operational permissions)
  - Tax pack management
  - Staff approval/rejection
```

## Skills Analysis Summary

### Senior Frontend
- **Proficient**: Next.js 16 + React 19, shadcn/ui, Tailwind CSS, Zustand
- **Experienced**: WebSocket connections, REST polling, form state, accessibility (aria-live, focus-visible)
- **Knowledgeable**: KDS connection flow (WS + REST fallback), view mode persistence, CFR inventory UI
- **Needs verification**: Browser checker output, screen reader testing, keyboard navigation paths

### Senior Backend
- **Proficient**: Express + TypeScript, SQLite via better-sqlite3, JWT auth
- **Experienced**: Permission resolution systems, tax calculation engines, offline-first data safety
- **Knowledgeable**: Role-based permissions without ownership-gating, mDNS/Bonjour discovery, KDS WS protocol
- **Needs verification**: Permission override edge cases, tax pack update conflict resolution

### Senior Fullstack
- **Proficient**: Electron + Next.js desktop export boundary, API route patterns, IPC handlers
- **Experienced**: Offline-first state management, authorization without ownership-gating, multi-port daemon coordination
- **Knowledgeable**: End-to-end flows (order → KDS → printing), CFR inventory integration, permission system architecture
- **Critical awareness**: Desktop static export boundary (no SSR, no API routes in desktop mode), port contention on dev/test

## Red Flags & Sharp Edges (from CLAUDE.md)

1. **Desktop static export boundary**: When `NEXT_BUILD_MODE=desktop`, no Next.js API routes or server cookies; all dynamic logic in Express (`:3001`) or Electron IPC
2. **Port contention**: Daemons hold ports `:3001` (API), `:3002` (KDS), `:3003` (Server App); use `npm run clean` to clear
3. **Playwright config**: `playwright.config.ts` is in `frontend/`; use `npm run test:e2e:browser` from root
4. **Tests must actually run**: New suites must be wired into `package.json` - a suite nothing runs protects nothing
5. **Receipt width**: `tests/receipt-column-oracle.test.ts` pins display cells to golden receipt; width changes require regeneration
6. **No unapproved mutations**: No GitHub issue/PR creation without explicit instruction
7. **Secrets protection**: Never commit `.env` files, API keys, customer data
8. **Match migration risk**: Don't add multi-layer compatibility state without evidence of user dependence

## Recommendations

### For Frontend Development
1. Reuse existing components (Button, Input, etc.) from project's component library
2. Handle all states: loading, empty, error, success, pending action, long/odd content, partial failure
3. Design at 375px wide first, then widen; never horizontal scroll
4. Touch targets ≥24×24 CSS px (WCAG 2.2), ≥44px for primary actions
5. Respect `prefers-reduced-motion`; animate `transform` and `opacity` only
6. Use semantic HTML; `<button>` for actions, `<a href>`/Link for navigation
7. Every input needs visible `<label>` or `aria-label`, right `type`, `name`, `autocomplete`
8. One `<h1>` per page, headings in order

### For Backend Development
1. Maintain backend authority on tax, payment, and security calculations
2. Never add `role === 'server' && order.user_id !== user.userId`-style checks
3. Keep authorization role/action-based, not creator-based
4. Validate all inputs; use parameterized queries
5. Keep database migrations backward-compatible; never truncate existing data
6. Handle offline mode gracefully; optional features fail when offline

### For Fullstack Integration
1. Wire every new test suite into `package.json` test scripts
2. Clear ports with `npm run clean` before dev/test commands
3. Run `npm run docs:check` after doc changes
4. Run `npm run i18n:check` after translation changes
5. Follow Conventional Commits for all changes
6. Batch review fixes into single verified pushes
7. Verify every behavioral claim against current code/tests before documenting

## Files to Reference
- `docs/reference/product-invariants.md` - Product boundary definitions
- `docs/reference/roles-and-permissions.md` - Role/permission details
- `docs/architecture/` - System architecture documents
- `main/services/authorization.ts` - Permission resolution
- `main/server.ts` - Express setup and middleware
- `frontend/src/hooks/useKdsConnection.ts` - KDS connection flow
- `frontend/src/components/CfrInventoryView.tsx` - CFR inventory UI