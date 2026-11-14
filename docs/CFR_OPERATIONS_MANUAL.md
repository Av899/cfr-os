# CFR OS: Cafe Operations & Staff SOP Manual

> **Venue**: Coffee First Ritual (CFR)  
> **Target Audience**: Baristas, Cashiers, Bakery Chefs, Shift Leads, and General Managers  
> **Mandate**: Ensuring Flawless Daily Execution, Dietary Compliance, and Financial Integrity  

---

## 1. Morning Opening Standard Operating Procedure (07:30 AM – 08:00 AM)

```
07:30 AM ──► 07:40 AM ──► 07:45 AM ──► 07:55 AM ──► 08:00 AM
Power Up     La Marzocco  Espresso     Boulangerie  POS Register
& Ambience   KB90 Warmup  Dial-In      Oven Bake    Ready
```

### Step 1: System Power & Hardware Checks
1. Ensure the counter POS tablet and kitchen display (KDS) are powered on.
2. Confirm the main server terminal is running (`node dev-all.js` or desktop daemon).
3. The lighting and Sonos audio system will automatically engage the **Workspace Morning Scene** (4000K neutral light, 60 dB acoustic jazz).
4. In POS **Settings $\rightarrow$ Printers**, verify that the counter receipt printer and bar KOT printer display green **Ready** badges.

### Step 2: La Marzocco KB90 Espresso Machine Warmup
1. Turn main machine switch to position 1 (water fill) then position 2 (heating).
2. Allow 20 minutes for the dual PID boilers to reach thermal equilibrium:
   - **Brew Boiler**: Target $93.5^\circ\text{C}$
   - **Steam Boiler**: Target $1.8\text{ bar}$
3. Flush each of the 3 groupheads for 5 seconds to stabilize brew temperature.

### Step 3: Barista Morning Espresso Dial-In Calibration
1. Navigate to **POS $\rightarrow$ Coffee Dial-In** (or tap the coffee bean badge at the top).
2. Check the active bean lot. Verify the roast stage is **PEAK** (Days 8–28) or **DEGASSING** (Days 1–7). If the active lot is marked **STALE**, immediately notify the lead roaster and switch to a fresh lot.
3. Dose **18.5g** of coffee into the portafilter using the Mahlkönig E65S GbW grinder.
4. Extract into an espresso cup on an Acaia scale:
   - Target yield: **37.0g to 39.0g** (Brew ratio $\approx 1:2.05$)
   - Target extraction time: **26 to 29 seconds**
   - Target flow rate: $\approx 1.35\text{ to }1.45\text{ g/s}$
5. Taste the espresso (sweetness, acidity, clarity, crema texture).
6. In the dial-in form, enter:
   - Dry Dose: `18.5`
   - Liquid Yield: `38.0`
   - Time: `28.0`
   - Grind Setting: `2.4`
   - Tasting Notes: `e.g. Red cherry acidity, dark chocolate finish, velvety body`
7. Tap **Record Dial-in Shot**.
   > *Note*: The system will automatically log the 18.5g of coffee beans as zero-revenue calibration waste under `DIAL_IN_SHOT` in the inventory FEFO ledger and update grinder burr wear.

### Step 4: Bakery Morning Bake & Unox Oven Prep
1. Preheat the Unox Combi Oven to $175^\circ\text{C}$ with $20\%$ steam injection.
2. Bake morning artisanal croissants, pain au chocolat, and savory tartines.
3. Check the guest digital menu at `http://localhost:3000/menu`. Ensure all baked items display as **Available**. If an item is delayed, tap the item on the POS catalog to toggle it to **Sold Out (86'd)** until trays come out of the oven.

---

## 2. Front Counter & Cashier Service SOP

### Step 1: Creating an Order in the Cart
1. Select the order type: **Dine-In**, **Takeaway**, or **Delivery**.
2. If **Dine-In**, tap the summary bar to select the Table Number and set Guest Count (Pax).
3. Tap menu items to add them to the cart. If a customer requests modifications (e.g. Oat Milk substitution, Extra Shot, Less Sweet), select the corresponding modifier pills.
4. Notice the **Haryana 5% GST Breakdown Preview** at the bottom of the cart:
   - CGST (2.5%)
   - SGST (2.5%)
   - Round-off
   - Estimated Net Total
5. The price total will always be in clean ₹10 increments.

### Step 2: Payment Collection via Dynamic UPI QR
1. Tap **Pay** $\rightarrow$ select **UPI**.
2. The customer facing screen will display the **NPCI Dynamic UPI QR** code populated with the exact rupee amount (e.g. ₹473.00) and order invoice reference.
3. The customer scans the QR code with Google Pay, PhonePe, Paytm, BHIM, or any banking app.
4. When the payment completes, the POS will chime, print the sequential tax receipt (`CFR/26-27/000001`), and fire the ticket to the kitchen KDS.

### Step 3: Offline Emergency Payment SOP (WAN Interruption)
If the internet connection is disrupted:
1. The dynamic QR code will still render the exact invoice amount.
2. After the customer pays on their phone, tap **Manual UPI Entry** on the POS payment modal.
3. Inspect the customer's phone confirmation screen.
4. Enter the **12-digit Indian Bank UTR / Reference Number** (e.g. `202611140023`).
5. Tap **Confirm Payment**. The system validates the UTR format, prints the receipt, and marks the payment as locally confirmed, allowing service to proceed without delays.

---

## 3. Barista & Kitchen Display System (KDS) SOP

1. Orders appear on the KDS Kanban board under **New Orders**.
2. Card headers display large, bold order numbers (e.g. `#101`) for quick identification across the counter.
3. Customized drinks display add-on pills directly on the ticket card:
   - `+ Oatly Oat Milk ×1`
   - `+ Extra Double Shot ×1`
4. Once preparation begins, drag or tap the card to move it to **In Progress**.
5. When the drinks or pastries are placed on the pass, tap **Ready**:
   - The ticket turns green.
   - The system automatically triggers the **Server Wrist Pager**, buzzing floor staff that Table 4's order is ready for delivery.

---

## 4. Dietary & Ingredient Sovereignty Rules

> [!CAUTION]
> **Zero Tolerance Dietary Mandate**  
> Coffee First Ritual is strictly 100% Vegetarian and Artisanal Eggless.  
> Any violation will corrupt the brand promise and break SQLite database invariants.

1. **Eggless Pastry Rule**: All croissants, brioche, choux, and pastries use artisanal reduced chickpea aquafaba, cultured butter, and plant-based binders. **No egg wash is ever permitted in the bakery kitchen.**
2. **Cheese Rennet Rule**: Only cheeses certified with microbial or vegetarian rennet (FPC) may be purchased. Conventional European cheeses containing calf rennet are strictly prohibited.
3. **Gelatin Rule**: No animal gelatin. Marshmallows, jellies, and panna cotta must use agar-agar, pectin, or carrageenan.
4. **Coloring Rule**: Carmine / Cochineal extract (E120) is prohibited. Natural fruit reductions or beetroot powders are used instead.

---

## 5. Evening Closing Standard Operating Procedure (10:00 PM – 10:30 PM)

```
10:00 PM ──► 10:10 PM ──► 10:15 PM ──► 10:20 PM ──► 10:30 PM
Count Cash   Run Daily    Print 80mm   Export GSTR-1  Run Safe
Drawer       Z-Report     Slip         CA CSV         Backup
```

### Step 1: Cash Drawer Count
1. Remove all currency notes and coins from the cash drawer.
2. Count the physical cash on the counter:
   - Separate the opening cash float (e.g. ₹5,000.00).
   - Count the net cash collected from today's orders.

### Step 2: Running the Daily Z-Report
1. In the CFR navigation bar, navigate to **Reports & Z-Close** (`/reports`).
2. Enter the actual counted cash in the **Counted Cash** field.
3. Review the live reconciliation card:
   - Expected Drawer Cash = Opening Float + Cash Sales - Cash Payouts
   - Actual Counted Cash
   - **Cash Variance**: Must show **₹0.00 (Balanced)**. If variance is detected, double-check drawer envelopes and petty cash vouchers.
4. Tap **Generate Daily Z-Report**.
5. Tap **Print Thermal Slip** to print the official 80mm end-of-day summary slip. File the printed slip in the daily manager binder.

### Step 3: Chartered Accountant GSTR-1 CSV Export
1. On the Reports page, tap **Export GSTR-1 CSV**.
2. The system generates an RFC-4180 compliant CSV containing all invoices (`CFR/26-27/*`) and credit notes (`CN/26-27/*`) issued during the business day with full SAC 996331 tax breakdowns.
3. Save the CSV to the store's accounting drive for monthly GST filing.

### Step 4: Machine Chemical Cleaning & Backflush
1. **La Marzocco KB90**:
   - Insert blind filter basket with 3g Cafiza detergent powder into Group 1.
   - Run automatic backflush cycle (5 pulses of 10s run, 10s rest). Repeat for Groups 2 and 3.
   - Remove portafilters and scrub shower screens with brass brush.
   - Soak steam wands and portafilter spouts in hot water and Cafiza.
2. **Unox Combi Oven**:
   - Initiate the automated Rotor.KLEAN chemical wash cycle.
3. In **Settings $\rightarrow$ Equipment Checklists**, mark all three daily cleaning tasks as **Completed**.

### Step 5: Safe Online Database Backup
1. On the Reports page, navigate to the **Backup & Storage** tab.
2. Tap **Create Pristine Backup Snapshot**.
3. Confirm the backup file appears in the list with `integrity: ok` (e.g. `cfr-backup-20261115-221500.db`).
4. Power down counter terminals. Leave the primary server host on for overnight maintenance.
