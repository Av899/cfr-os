# CFR OS: System Architecture & Technical Manual

> **Venue**: Coffee First Ritual (CFR)  
> **Location**: Sector 12, Karnal, Haryana, India  
> **Edition**: Production Release 1.0 (Hard Fork of FloCafe)  
> **Core Mandate**: 100% Vegetarian & Artisanal Eggless Specialty Coffee & Viennoiserie  

---

## 1. Executive Summary & Brand Principles

**CFR OS** is a specialized, air-gapped, offline-resilient restaurant operating system engineered specifically for **Coffee First Ritual (CFR)** in Karnal, Haryana. 

Built on a hardened fork of the open-source FloCafe point-of-sale platform, CFR OS replaces generic retail assumptions with domain-specific engines for:
1. **Uncompromising Dietary Integrity**: 100% Vegetarian and Artisanal Eggless enforcement at database schema, service, and UI levels.
2. **Indian Fiscal & Regulatory Precision**: Haryana 5% GST computation (2.5% CGST + 2.5% SGST), whole ₹10 price increments, gap-free Financial Year sequential invoicing (`CFR/26-27/000001`), and statutory credit notes (`CN/26-27/000001`).
3. **Dual-Track Payments**: NPCI Dynamic UPI QR generation with an offline-resilient 12-digit Indian bank UTR reconciler.
4. **Artisanal Coffee & Bakery Operations**: Gram-level multi-level Bill of Materials (BOM) deduction, FEFO (First-Expired, First-Out) lot expiry allocation, specialty coffee roast freshness curves, and morning barista espresso dial-in calibration logging.
5. **Smart Hardware Telemetry**: Live Unox Combi Oven telemetry, La Marzocco KB90 grouphead pressure/temperature telemetry, server wrist pagers, and scheduled ambience lighting/Sonos soundscapes.
6. **Statutory Reporting & Backups**: Daily audit Z-Report engine, Chartered Accountant GSTR-1 RFC-4180 CSV export, and non-locking SQLite `VACUUM INTO` online backup engine.

---

## 2. System Architecture & The "Seam" Pattern

CFR OS follows an **isolated Seam architecture**. Rather than rewriting core FloCafe files, all CFR business logic lives in dedicated namespaces, interfacing with FloCafe via minimal, non-invasive integration hooks ("seams"):

```
FloCafe Core Engine (main/ & frontend/src/)
        │
        ├── Seam: Startup Migrator (main/db.ts ➔ runCfrMigrations)
        ├── Seam: Order Completion (main/routes/orders.ts ➔ deductOrderBOM, burrWear, beanLots)
        ├── Seam: KDS Synchronization (main/routes/kds.ts ➔ syncParentOrderStatus, pagerAlert)
        ├── Seam: API Gateway (main/routes/index.ts ➔ /api/cfr/*)
        └── Seam: Cart & Checkout UI (CartPanel.tsx ➔ GST Breakdown Preview)
        │
        ▼
CFR Dedicated Namespace (main/cfr/ & frontend/src/app/menu/)
        ├── dietary/      ➔ Zero-tolerance eggless & vegetarian guard
        ├── money/        ➔ Haryana 5% GST engine & ₹10 price validator
        ├── invoicing/    ➔ Gap-free FY sequence & credit note engine
        ├── payments/     ➔ NPCI UPI QR generator & 12-digit UTR reconciler
        ├── inventory/    ➔ Gram-level BOM deduction & FEFO lot allocation
        ├── coffee/       ➔ Degassing curves, dial-in logger, burr tracking
        ├── adapters/     ➔ Unox oven, La Marzocco KB90, pagers, ambience
        ├── reports/      ➔ Daily Z-report & CA GSTR-1 CSV exporter
        └── backup/       ➔ Safe online SQLite VACUUM INTO snapshots
```

---

## 3. The 7 Core Operational Engines

### 3.1. Engine 1: Dietary Safety & Schema Guard (Week 1)
- **Zero-Tolerance Flags**: Every ingredient carries an array of dietary flags. Banned tags include:
  - `CONTAINS_EGG` (Eggs, egg whites, yolks, egg wash, dried egg powder)
  - `GELATIN` (Animal-derived gelatin, clarifying agents)
  - `ANIMAL_RENNET` (Calf rennet used in conventional European cheeses)
  - `CARMINE` (E120 cochineal insect red food coloring)
  - `MEAT_FISH` (Meat, poultry, fish, seafood extracts)
  - `LARD` (Animal fats, suet)
- **SQLite CHECK Constraints**: Physical database constraints reject any row with forbidden flags.
- **Recipe Guard**: Multi-level recipes recursively validate child sub-recipes. Any recipe containing an uncertified component triggers `ERR_CFR_DIETARY_VIOLATION`.

### 3.2. Engine 2: Haryana 5% GST & Sequential Invoicing (Week 2)
- **Integer Arithmetic**: All monetary transactions are computed in integer paise ($1\text{ Rupee} = 100\text{ paise}$).
- **Price Increments**: All catalog prices must strictly be multiples of 1,000 paise (₹10, ₹220, ₹230, ₹340).
- **Haryana Restaurant GST**:
  - Taxable Base: Subtotal excl. tax
  - CGST: $2.5\%$ ($\text{paise} \times 25 / 1000$)
  - SGST: $2.5\%$ ($\text{paise} \times 25 / 1000$)
  - Round-off: Difference between raw total and nearest whole rupee
  - SAC Code: `996331` (Restaurant and catering services)
- **Gap-Free Numbering**: Sequential numbering formatted as `CFR/26-27/000001`. Financial year rolls over on April 1st.
- **Credit Notes**: Order voids issue statutory `CN/26-27/000001` credit notes referencing the parent invoice.

### 3.3. Engine 3: Dynamic UPI QR & Dual-Track Payments (Week 3)
- **NPCI Specification**: Complies with standard Indian UPI URI protocols:
  `upi://pay?pa=cfrcoffee@icici&pn=CFR+Coffee&am=473.00&tn=CFR-INV-000001&cu=INR&mc=5812`
- **Dynamic QR**: Generated instantly on POS and guest screens with an active expiry countdown.
- **WAN Offline Resilience**: When the internet drops, cashiers can enter the 12-digit Indian Bank UTR reference directly. The payment enters `PENDING_RECONCILIATION` and confirms locally without holding up the customer line.

### 3.4. Engine 4: Gram-Level BOM & FEFO Inventory (Week 4)
- **Gram & Milliliter Precision**: Menu items map to exact gram/ml recipe measurements (e.g. Flat White = 18g espresso beans + 180ml Oatly oat milk; Pistachio Croissant = 1 Plain Croissant + 30g pure Bronte pistachio paste + 8g cane sugar).
- **FEFO Allocation**: Consumes stock from ingredient batches with the earliest expiry date first. If a batch runs out mid-order, allocation automatically splits and cascades to the next batch.
- **Order Lifecycle Hook**: BOM deductions trigger automatically on order completion; order cancellations cleanly reverse deductions.

### 3.5. Engine 5: Specialty Coffee Freshness & Dial-In Logger (Week 5)
- **Degassing & Freshness Curve**: Calculates days off roast from roaster delivery dates:
  - **Degassing** (Days 1–7): Still off-gassing $\text{CO}_2$; amber indicator.
  - **Peak Flavor** (Days 8–28): Optimal extraction window; emerald indicator.
  - **Fading** (Days 29–45): Aromatics declining; orange indicator.
  - **Stale** (>45 days): Past prime; rose alert.
- **Barista Morning Dial-In**: Logs dry dose (g), liquid yield (g), extraction time (s), collar grind setting, tasting notes, and calculates brew ratio ($1:X$) and flow rate ($g/s$). Test shots are recorded as zero-revenue `DIAL_IN_SHOT` waste in the FEFO ledger.
- **Burr Wear Tracking**: Commercial grinder (Mahlkönig E65S GbW) accumulates cumulative kilograms ground, issuing warnings at 80% wear and replacement alerts at 100% of the 500 kg rating.

### 3.6. Engine 6: Guest Digital Menu & Hardware Adapters (Week 6)
- **Luxury Mobile Menu (`/menu`)**: Responsive mobile-first interface designed like printed cream editorial paper. Groups offerings into 7 signature sections:
  1. Espresso Bar
  2. Manual Brew Theatre
  3. Cold Rituals
  4. Beyond Coffee
  5. Boulangerie
  6. Savory & Tartines
  7. Evening Bowls
- **Real-Time 86’d Availability**: Sold-out items vanish from the public menu in under 1 second.
- **Hardware Telemetry**:
  - **Unox Combi Oven**: Preheating, moisture injection, and chemical wash tracking.
  - **La Marzocco KB90**: Dual boiler PID temperature ($93.5^\circ\text{C}$ brew, $1.8\text{ bar}$ steam) and grouphead backflush prompts.
  - **Server Wrist Pagers**: Dispatches wireless alerts when orders are bumped on KDS.
  - **Ambience Scene Engine**: Automated lighting warmth (4000K Workspace $\rightarrow$ 2700K Golden Hour $\rightarrow$ 2200K Evening Lounge) and Sonos sound pressure targets.

### 3.7. Engine 7: Daily Z-Report & Audit Backups (Week 7)
- **Daily Z-Report (`/reports`)**:
  - End-of-day sales, taxes (CGST + SGST), discounts, net taxable value.
  - Cash drawer reconciliation: Opening float + Cash sales - Cash payouts = Expected drawer cash. Calculates over/short variance.
  - Cost of Goods Sold (COGS) & dial-in calibration shot food cost accounting.
  - Formatted 80mm thermal slip printing.
- **Chartered Accountant GSTR-1 CSV**: One-click RFC-4180 CSV export with B2B/B2C invoice rows, credit notes, SAC codes, and Haryana state code (`06-Haryana`).
- **Safe Online SQLite Backup**: Executes SQLite `VACUUM INTO` to produce pristine timestamped database snapshots without interrupting active counter terminals.

---

## 4. Upstream FloCafe Features Inculcated

CFR OS incorporates beneficial upstream enhancements from FloCafe while strictly preserving CFR invariants:

| Feature | Upstream Origin | Benefit to CFR OS | Preservation Guarantee |
|---|---|---|---|
| **Compact 2-Tier Cart Layout** | `10facbc9` | Decreases cart item height by 40%, fitting 6–8+ items without scrolling | Retains CFR Haryana 5% GST breakdown preview & `size="pos"` styling |
| **Order Details Drawer** | `013e2f71` | Slides customer, table, and Pax details into an expandable sheet | Frees up vertical cart real estate on tablets and POS registers |
| **LAN Printer Auto-Discovery** | `ec8e53b5` | mDNS & port 9100 network scanning for thermal printers | Zero configuration required when adding countertop receipt printers |
| **Live Hardware Status Probing** | `ec8e53b5` | Interrogates ESC/POS printers for cover-open, paper-out, and offline states | Status badges display live in Settings; prevents silent print drops |
| **Printable ASCII Currency Fallback** | `177f6436` | Converts `₹` to `Rs` on legacy thermal hardware | Prevents distorted or unprintable characters on 80mm ESC/POS slips |
| **KDS Inline Add-On Modifier Pills** | `dbd2ca2f` | Displays item modifiers (`+ Oat Milk ×1`, `+ Extra Shot ×1`) inline | Baristas read customizations at a glance without expanding cards |
| **Bold KDS Order Numbers** | `ce32996b` | Enlarges card order numbers (`font-extrabold text-lg`) | Ensures high visibility across the barista bar |
| **Windows NTFS BigInt Inode Fix** | `9e51d5b9` | Uses 64-bit BigInt stats during backup verification | Prevents filesystem comparison overflow errors on Windows NTFS drives |

---

## 5. API Reference Catalog

All custom CFR endpoints are namespaced under `/api/cfr/`:

### System & Health
- `GET /api/cfr/health`: System health, schema version, staple counts, active policy confirmation.

### Invoicing & Tax
- `POST /api/cfr/invoices/preview`: Compute Haryana 5% GST, round-off, and net payable for a draft order.
- `POST /api/cfr/invoices/issue`: Finalize order and allocate gap-free `CFR/26-27/000001` invoice number.
- `GET /api/cfr/invoices`: List historical invoices with filtering.
- `GET /api/cfr/invoices/:id`: Fetch specific invoice details and tax breakdown.
- `POST /api/cfr/invoices/:id/void`: Void an invoice and issue statutory `CN/26-27/000001` credit note.
- `GET /api/cfr/invoices/:id/receipt-text`: Generate raw ESC/POS thermal receipt string.

### Dynamic UPI & Payments
- `POST /api/cfr/payments/upi-qr`: Generate NPCI-compliant UPI URI and Base64 QR code.
- `POST /api/cfr/payments/reconcile-manual`: Reconcile payment with a 12-digit Indian bank UTR number.
- `POST /api/cfr/payments/webhook`: Bank/payment gateway webhook listener.
- `GET /api/cfr/payments/pending`: List pending un-reconciled payments.

### Inventory & BOM
- `GET /api/cfr/inventory/stock`: Summary of ingredient stock levels and par alert warnings.
- `POST /api/cfr/inventory/lots`: Receive new stock batch with expiration date.
- `POST /api/cfr/inventory/waste`: Record spillage, kitchen waste, or barista calibration dosage.
- `GET /api/cfr/inventory/movements`: Audit log of all stock movements.
- `GET /api/cfr/recipes`: List recipes, sub-recipes, and gram-level ingredients.

### Specialty Coffee
- `GET /api/cfr/coffee/lots`: List all bean lots with roast dates and remaining weights.
- `GET /api/cfr/coffee/lots/active`: Get currently active espresso hopper bean lot and degassing stage.
- `POST /api/cfr/coffee/lots`: Register new coffee bean delivery.
- `PATCH /api/cfr/coffee/lots/:id/activate`: Set bean lot as active espresso hopper origin.
- `GET /api/cfr/coffee/dial-in/latest`: Fetch today's most recent barista dial-in shot parameters.
- `POST /api/cfr/coffee/dial-in`: Record morning dial-in calibration shot and log waste.
- `GET /api/cfr/coffee/dial-in/history`: History of dial-in calibrations.
- `GET /api/cfr/coffee/grinder/wear`: Grinder burr wear percentage and status.
- `POST /api/cfr/coffee/grinder/reset`: Reset burr counter following burr sharpening or replacement.

### Guest Menu & Hardware
- `GET /api/cfr/menu`: Public digital menu data with sections, craft stories, and pricing.
- `GET /api/cfr/menu/item/:id`: Detailed item craft story, tasting notes, and allergen profile.
- `PATCH /api/cfr/menu/item/:id/availability`: 86 an item (toggle available vs. sold out).
- `GET /api/cfr/equipment/checklists`: Equipment cleaning checklists (Oven, KB90, Grinder).
- `POST /api/cfr/equipment/checklists/:id/complete`: Mark cleaning task completed.
- `GET /api/cfr/hardware/oven/status`: Unox oven temperature and active program telemetry.
- `GET /api/cfr/hardware/espresso/telemetry`: La Marzocco KB90 boiler pressures and temperatures.
- `POST /api/cfr/hardware/pager/buzz`: Dispatch wrist pager alert.
- `GET /api/cfr/hardware/ambience/current`: Current scheduled lighting and audio scene.
- `POST /api/cfr/hardware/ambience/override`: Temporarily override ambience scene.

### Reports & Backup
- `GET /api/cfr/reports/z-report`: Generate live daily Z-Report with cash drawer variance.
- `GET /api/cfr/reports/z-report/thermal`: Format Z-Report for 80mm thermal receipt printer.
- `GET /api/cfr/reports/gst-export`: Export Chartered Accountant GSTR-1 RFC-4180 CSV.
- `POST /api/cfr/backup/run`: Trigger safe online SQLite `VACUUM INTO` backup.
- `GET /api/cfr/backup/list`: List available backup snapshots and file sizes.

---

## 6. Verification & Automated Testing

The complete CFR OS test suite consists of **276 automated assertions across 7 test suites**:

```bash
# Execute full CFR OS test suite
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-dietary.test.ts
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-gst-invoicing.test.ts
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-upi-payments.test.ts
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-bom-fefo.test.ts
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-coffee-freshness.test.ts
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-menu-adapters.test.ts
npx ts-node --transpile-only -P tests/tsconfig.json tests/cfr-z-report-backup.test.ts
```

All 276 tests must pass with zero warnings or errors prior to production deployment.
