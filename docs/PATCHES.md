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
