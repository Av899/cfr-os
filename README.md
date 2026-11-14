<div align="center">
  <img src="assets/cfr-logo.png" alt="Coffee First Ritual (CFR) Logo" width="220" />
  <h1>☕ CFR OS (Coffee First Ritual)</h1>
  <p><strong>Artisanal Specialty Coffee & Viennoiserie Point-of-Sale & Operations Engine</strong></p>
  <p><em>Sector 12, Karnal, Haryana, India</em></p>
  <p>
    <strong>100% Vegetarian & Eggless</strong> ·
    <strong>Haryana 5% GST</strong> ·
    <strong>Dynamic UPI QR</strong> ·
    <strong>Gram-Level BOM & FEFO</strong> ·
    <strong>Specialty Coffee Curves</strong>
  </p>
</div>

---

## 📖 Overview

**CFR OS** is an air-gapped, offline-first restaurant operating system engineered specifically for **Coffee First Ritual (CFR)**. Hard-forked from the robust [FloCafe](https://github.com/FreeOpenSourcePOS/FloCafe) platform, CFR OS enforces rigorous dietary, fiscal, inventory, and hardware standards tailored to an artisanal roastery and bakery.

---

## 🏛 Core Architectural Engines

### 1. 100% Vegetarian & Artisanal Eggless Policy
- Unbreakable zero-tolerance safety guard enforced at database schema and service levels.
- Physical SQLite `CHECK` constraints prevent insertion of banned ingredients (`CONTAINS_EGG`, `GELATIN`, `ANIMAL_RENNET`, `CARMINE`, `MEAT_FISH`, `LARD`).
- Recipe resolution recursively validates all sub-components and rejects non-compliant items.

### 2. Indian Fiscal & Haryana 5% GST Compliance
- Strict integer paise arithmetic (eliminating floating-point rounding errors).
- Whole ₹10 catalog price increment validator (`paise % 1000 === 0`).
- Haryana 5% Restaurant GST (2.5% CGST + 2.5% SGST + round-off to nearest rupee) on SAC `996331`.
- Gap-free sequential invoices (`CFR/26-27/000001`) with automatic FY rollover and statutory credit notes (`CN/26-27/000001`).

### 3. Dynamic UPI QR & Dual-Track Payments
- NPCI-compliant dynamic UPI payload generation with exact rupee amounts.
- On-screen QR codes with live countdown timers for touch-free scan-to-pay.
- Dual-track payment engine: automatic webhook reconciliation when online, 12-digit Indian bank UTR offline entry when WAN connectivity drops.

### 4. Gram-Level BOM & FEFO Inventory Engine
- Precise ingredient deduction in exact grams and milliliters per item sold.
- Multi-level sub-recipe resolution (e.g., Almond Croissant $\rightarrow$ Plain Croissant + Frangipane Cream + Flaked Almonds).
- FEFO (First-Expired, First-Out) stock allocation automatically consumes earlier expiring batches first and cascades across lots.

### 5. Specialty Coffee Degassing Curves & Barista Dial-In
- Real-time roast curve calculation: **Degassing** (Days 1–7), **Peak Flavor** (Days 8–28), **Fading** (Days 29–45), and **Stale** (>45 days).
- Morning barista espresso dial-in logger: tracks dose (g), yield (g), extraction time (s), grind collar setting, brew ratio ($1:X$), and flow rate ($g/s$).
- Test shots automatically logged as zero-revenue calibration waste in the FEFO ledger.
- Commercial grinder burr wear tracking (e.g. Mahlkönig E65S GbW 500 kg burr life).

### 6. Luxury Guest Digital Menu & Hardware Adapters
- Public mobile digital menu ([http://localhost:3000/menu](http://localhost:3000/menu)) with cream-paper editorial styling and craft stories.
- Real-time 86'd syncing: sold-out items vanish from the guest menu in under 1 second.
- Smart hardware telemetry adapters for Unox Combi Ovens, La Marzocco KB90 espresso machines, server wrist pagers, and Sonos/lighting ambience scenes.

### 7. Daily Audit Z-Report, CA Export & Safe Online Backups
- End-of-day Z-Report with cash drawer float reconciliation and variance reporting.
- Formatted 80mm thermal receipt slip printing.
- One-click Chartered Accountant GSTR-1 RFC-4180 CSV export for monthly tax filing.
- Non-locking SQLite `VACUUM INTO` online database backups with SHA-256 integrity checks.

---

## 🚀 Upstream FloCafe Features Inculcated

CFR OS integrates the latest performance and hardware innovations from FloCafe upstream:
- **Compact 2-Tier Cart Layout**: High-density line items, 28px non-overlapping touch targets, and inline add-on modifier pills.
- **Slide-Over Order Details Drawer**: Dedicated sheet for Pax, customer details, and notes that keeps the main cart clean and uncluttered.
- **Thermal LAN Printer Auto-Discovery**: Automatic mDNS + port 9100 network scan with live ESC/POS hardware status probing (Ready, Paper Low, Offline).
- **Printable ASCII Currency Fallback**: Converts `₹` to `Rs` on thermal printers lacking native Unicode support.
- **Windows NTFS BigInt Inode Fix**: 64-bit filesystem stat checks preventing backup validation overflows on Windows.

---

## 📚 Documentation Index

- [System Architecture & Technical Manual](docs/CFR_OS_SYSTEM_MANUAL.md) — Exhaustive system architecture, API endpoints, and database schema documentation.
- [Cafe Operations & Staff SOP Manual](docs/CFR_OPERATIONS_MANUAL.md) — Daily standard operating procedures for Baristas, Cashiers, Bakery Chefs, and General Managers.
- [Printer Setup & Hardware Diagnostics Guide](docs/printers.md) — ESC/POS network thermal printer pairing, paper widths, and driver setup.

---

## 🛠 Quick Start & Development

### Prerequisites
- Node.js 20+
- SQLite 3
- Windows, macOS, or Linux

### Installation & Launch
```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Compile TypeScript
npm run build

# Start both backend and frontend development servers
node dev-all.js
```

### URLs
- **POS Register**: `http://localhost:3000/pos`
- **Guest Digital Menu**: `http://localhost:3000/menu`
- **Reports & Daily Z-Close**: `http://localhost:3000/reports`
- **KDS Kitchen Screen**: `http://localhost:3000/kds`
- **API Health Check**: `http://localhost:3001/api/cfr/health`

---

## 🧪 Running Automated Tests

CFR OS includes a full regression suite of **276 automated test assertions** across 7 test suites:

```bash
# 1. Dietary Safety & SQLite Invariants (39 tests)
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-dietary.test.ts

# 2. Haryana 5% GST & Sequential Invoicing (43 tests)
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-gst-invoicing.test.ts

# 3. Dynamic UPI QR & 12-Digit Bank UTR (36 tests)
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-upi-payments.test.ts

# 4. Gram-Level BOM & FEFO Lot Allocation (37 tests)
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-bom-fefo.test.ts

# 5. Specialty Coffee Roast Curves & Dial-in (37 tests)
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-coffee-freshness.test.ts

# 6. Guest Digital Menu & Hardware Adapters (38 tests)
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-menu-adapters.test.ts

# 7. Daily Z-Report & Online SQLite Backup (46 tests)
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-z-report-backup.test.ts
```

---

## ⚖ License

Proprietary modifications & domain engines © 2026 Coffee First Ritual (CFR).  
Base FloCafe POS licensed under [MIT License](LICENSE).
