/**
 * CFR OS: End-of-Day Z-Report Generator & Shift Balancing Engine
 * Aggregates daily financial sales, Haryana 5% GST breakdown, payment method splits,
 * inventory COGS food cost variance, and cash drawer reconciliations.
 */

import type Database from 'better-sqlite3';
import { CfrDailyZReport } from '../types/reports';
import { getActiveBeanLot } from '../coffee/bean-lots';
import { getPrimaryGrinder } from '../coffee/burr-wear';

export interface GenerateZReportOptions {
  businessDate?: string; // YYYY-MM-DD (defaults to local today)
  openingFloatPaise?: number; // Defaults to 500000 (₹5,000.00)
  actualCountedCashPaise?: number | null;
}

/**
 * Generates the official Daily Z-Report for a given business date.
 */
export function generateDailyZReport(
  db: Database.Database,
  options: GenerateZReportOptions = {},
): CfrDailyZReport {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const localTodayStr = `${year}-${month}-${day}`;

  const businessDate = options.businessDate || localTodayStr;
  const openingFloatPaise = options.openingFloatPaise ?? 500000; // ₹5,000 opening float
  const now = new Date().toISOString();

  // 1. Query Invoices for the date
  const invoiceRows = db
    .prepare(`
      SELECT * FROM cfr_invoices
      WHERE (created_at LIKE ? OR COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?)
        AND status = 'ISSUED'
      ORDER BY invoice_number ASC
    `)
    .all(`${businessDate}%`, businessDate) as Array<Record<string, any>>;

  let grossSalesPaise = 0;
  let netTaxablePaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let totalGstPaise = 0;
  let roundoffPaise = 0;
  let netPayablePaise = 0;

  if (invoiceRows.length > 0) {
    for (const inv of invoiceRows) {
      netTaxablePaise += Number(inv.taxable_paise ?? inv.subtotal_paise ?? 0);
      cgstPaise += Number(inv.cgst_paise ?? 0);
      sgstPaise += Number(inv.sgst_paise ?? 0);
      totalGstPaise += Number(inv.cgst_paise ?? 0) + Number(inv.sgst_paise ?? 0);
      roundoffPaise += Number(inv.roundoff_paise ?? 0);
      netPayablePaise += Number(inv.payable_paise ?? inv.total_paise ?? 0);
    }
    grossSalesPaise = netTaxablePaise;
  } else {
    // Fallback: check orders table if invoices haven't been generated
    const orderRows = db
      .prepare(`
        SELECT * FROM orders
        WHERE (
          created_at LIKE ? OR updated_at LIKE ? OR
          COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ? OR
          COALESCE(DATE(updated_at, '+330 minutes'), SUBSTR(updated_at, 1, 10)) = ?
        )
        AND status IN ('completed', 'served', 'ready')
      `)
      .all(`${businessDate}%`, `${businessDate}%`, businessDate, businessDate) as Array<Record<string, any>>;

    for (const ord of orderRows) {
      const orderTotalCents = ord.total !== undefined
        ? Math.round(Number(ord.total) * 100)
        : Number(ord.total_cents || 0);
      netPayablePaise += orderTotalCents;
    }
    // Estimate 5% GST reverse calculation
    netTaxablePaise = Math.round((netPayablePaise / 1.05));
    cgstPaise = Math.round(netTaxablePaise * 0.025);
    sgstPaise = Math.round(netTaxablePaise * 0.025);
    totalGstPaise = cgstPaise + sgstPaise;
    roundoffPaise = netPayablePaise - (netTaxablePaise + totalGstPaise);
    grossSalesPaise = netTaxablePaise;
  }

  // 2. Credit Notes for the date
  const creditNotes = db
    .prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount_paise), 0) as total
      FROM cfr_credit_notes
      WHERE (created_at LIKE ? OR COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?)
    `)
    .get(`${businessDate}%`, businessDate) as { count: number; total: number };

  // 3. Payment Method Breakdown
  const paymentRows = db
    .prepare(`
      SELECT method, COUNT(*) as count, COALESCE(SUM(amount_paise), 0) as total
      FROM cfr_payments
      WHERE (created_at LIKE ? OR COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?)
        AND status = 'CONFIRMED'
      GROUP BY method
    `)
    .all(`${businessDate}%`, businessDate) as Array<{ method: string; count: number; total: number }>;

  const paymentSplits = [
    { method: 'UPI_DYNAMIC', count: 0, amount_paise: 0 },
    { method: 'UPI_MANUAL', count: 0, amount_paise: 0 },
    { method: 'CASH', count: 0, amount_paise: 0 },
    { method: 'CARD', count: 0, amount_paise: 0 },
  ];

  let totalCashSalesPaise = 0;

  for (const row of paymentRows) {
    const existing = paymentSplits.find((p) => p.method === row.method);
    if (existing) {
      existing.count = row.count;
      existing.amount_paise = row.total;
    } else {
      paymentSplits.push({ method: row.method, count: row.count, amount_paise: row.total });
    }
    if (row.method === 'CASH') {
      totalCashSalesPaise += row.total;
    }
  }

  // If no cfr_payments recorded yet, pull splits from cfr_invoices
  if (totalCashSalesPaise === 0) {
    const invSplits = db
      .prepare(`
        SELECT payment_method, COUNT(*) as count, COALESCE(SUM(payable_paise), 0) as total
        FROM cfr_invoices
        WHERE (created_at LIKE ? OR COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?)
          AND status = 'ISSUED'
        GROUP BY payment_method
      `)
      .all(`${businessDate}%`, businessDate) as Array<{ payment_method: string; count: number; total: number }>;

    if (invSplits.length > 0) {
      for (const row of invSplits) {
        const split = paymentSplits.find((p) => p.method === row.payment_method);
        if (split) {
          split.count = row.count;
          split.amount_paise = row.total;
        } else {
          paymentSplits.push({ method: row.payment_method, count: row.count, amount_paise: row.total });
        }
        if (row.payment_method === 'CASH') {
          totalCashSalesPaise += row.total;
        }
      }
    }
  }

  // If still no cash sales, pull cash from orders table
  if (totalCashSalesPaise === 0) {
    try {
      // Try FloCafe standard orders schema first
      const cashOrderRow = db
        .prepare(`
          SELECT COALESCE(SUM(total), 0) as total_rupees, COUNT(*) as count
          FROM orders
          WHERE (created_at LIKE ? OR COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?)
            AND (expected_payment_method = 'cash' OR expected_payment_method LIKE '%cash%')
            AND status IN ('completed', 'served')
        `)
        .get(`${businessDate}%`, businessDate) as { total_rupees: number; count: number } | undefined;

      if (cashOrderRow && cashOrderRow.total_rupees > 0) {
        const cashAmountPaise = Math.round(cashOrderRow.total_rupees * 100);
        const cashSplit = paymentSplits.find((p) => p.method === 'CASH');
        if (cashSplit) {
          cashSplit.amount_paise = cashAmountPaise;
          cashSplit.count = cashOrderRow.count;
        }
        totalCashSalesPaise = cashAmountPaise;
      }
    } catch {
      try {
        // Fallback for mock schema with total_cents and payment_method
        const cashOrderRow = db
          .prepare(`
            SELECT COALESCE(SUM(total_cents), 0) as total, COUNT(*) as count
            FROM orders
            WHERE (created_at LIKE ? OR COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?)
              AND payment_method = 'cash' AND status IN ('completed', 'served')
          `)
          .get(`${businessDate}%`, businessDate) as { total: number; count: number } | undefined;

        if (cashOrderRow && cashOrderRow.total > 0) {
          const cashSplit = paymentSplits.find((p) => p.method === 'CASH');
          if (cashSplit) {
            cashSplit.amount_paise = cashOrderRow.total;
            cashSplit.count = cashOrderRow.count;
          }
          totalCashSalesPaise = cashOrderRow.total;
        }
      } catch {
        // Safe fallback
      }
    }
  }

  // 4. Operations Metrics (Orders count, cups served, average ticket)
  const totalOrdersCount = Math.max(invoiceRows.length, (
    db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE (created_at LIKE ? OR COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?)
        AND status IN ('completed', 'served')
    `).get(`${businessDate}%`, businessDate) as { count: number }
  )?.count || 0);

  const avgTicketPaise = totalOrdersCount > 0 ? Math.round(netPayablePaise / totalOrdersCount) : 0;

  // Total beverage cups served (BOM deductions or coffee items)
  let cupsServed = 0;
  try {
    const cupsRow = db
      .prepare(`
        SELECT COALESCE(SUM(oi.quantity), 0) as total
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE (o.created_at LIKE ? OR COALESCE(DATE(o.created_at, '+330 minutes'), SUBSTR(o.created_at, 1, 10)) = ?)
          AND o.status IN ('completed', 'served')
      `)
      .get(`${businessDate}%`, businessDate) as { total: number } | undefined;
    cupsServed = cupsRow?.total || 0;
  } catch {
    cupsServed = totalOrdersCount;
  }

  // 5. Inventory COGS & Food Cost Variance
  let theoreticalCogsPaise = 0;
  let calibrationWastePaise = 0;
  let spillageWastePaise = 0;

  try {
    // Query stock movements on date
    const movements = db
      .prepare(`
        SELECT sm.*, ing.cost_per_unit_paise
        FROM cfr_stock_movements sm
        JOIN cfr_ingredients ing ON sm.ingredient_id = ing.id
        WHERE (sm.created_at LIKE ? OR COALESCE(DATE(sm.created_at, '+330 minutes'), SUBSTR(sm.created_at, 1, 10)) = ?)
      `)
      .all(`${businessDate}%`, businessDate) as Array<Record<string, any>>;

    for (const m of movements) {
      const cost = Math.round(m.qty * m.cost_per_unit_paise);
      if (m.type === 'DEDUCTION_ORDER') {
        theoreticalCogsPaise += cost;
      } else if (m.type === 'WASTE') {
        if (m.reason && m.reason.startsWith('DIAL_IN')) {
          calibrationWastePaise += cost;
        } else {
          spillageWastePaise += cost;
        }
      }
    }
  } catch (err) {
    console.warn('[CFR Z-Report] COGS calculation warning:', err);
  }

  const totalCogsPaise = theoreticalCogsPaise + calibrationWastePaise + spillageWastePaise;
  const foodCostPercentage = netTaxablePaise > 0 ? Math.round((totalCogsPaise / netTaxablePaise) * 1000) / 10 : 0;

  // 6. Cash Drawer Reconciliation
  // Query expenses / payouts for the day
  let cashPayoutsPaise = 0;
  try {
    const expRow = db
      .prepare(`
        SELECT COALESCE(SUM(amount_minor), 0) as total
        FROM expenses
        WHERE (voided_at IS NULL) AND (
          incurred_on = ? OR
          created_at LIKE ? OR
          COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?
        )
      `)
      .get(businessDate, `${businessDate}%`, businessDate) as { total: number } | undefined;
    cashPayoutsPaise = expRow?.total || 0;
  } catch {
    try {
      const expRow = db
        .prepare(`
          SELECT COALESCE(SUM(amount_cents), 0) as total
          FROM expenses
          WHERE (
            date LIKE ? OR created_at LIKE ? OR
            COALESCE(DATE(created_at, '+330 minutes'), SUBSTR(created_at, 1, 10)) = ?
          )
        `)
        .get(`${businessDate}%`, `${businessDate}%`, businessDate) as { total: number } | undefined;
      cashPayoutsPaise = expRow?.total || 0;
    } catch {
      cashPayoutsPaise = 0;
    }
  }

  const expectedDrawerCashPaise = openingFloatPaise + totalCashSalesPaise - cashPayoutsPaise;
  const actualCounted = options.actualCountedCashPaise ?? null;
  const cashVariancePaise = actualCounted !== null ? actualCounted - expectedDrawerCashPaise : null;
  const isBalanced = cashVariancePaise !== null ? cashVariancePaise === 0 : true;

  // 7. Equipment Status Summary
  let activeLotName: string | null = null;
  let activeLotStage: string | null = null;
  let daysOffRoast: number | null = null;
  let grinderWearKg = 0;
  let grinderStatus = 'GOOD';
  let ovenWashCompleted = false;
  let espressoBackflushCompleted = false;

  try {
    const activeLot = getActiveBeanLot(db);
    if (activeLot) {
      activeLotName = activeLot.lot_name;
      activeLotStage = activeLot.freshness?.stage ?? 'PEAK';
      daysOffRoast = activeLot.freshness?.days_off_roast ?? null;
    }

    const grinder = getPrimaryGrinder(db);
    if (grinder) {
      grinderWearKg = grinder.cumulative_ground_kg ?? 0;
      grinderStatus = grinder.status ?? 'GOOD';
    }

    const ovenTask = db
      .prepare("SELECT is_completed FROM cfr_equipment_tasks WHERE id = 'task_unox_wash_pm'")
      .get() as { is_completed: number } | undefined;
    ovenWashCompleted = ovenTask?.is_completed === 1;

    const espressoTask = db
      .prepare("SELECT is_completed FROM cfr_equipment_tasks WHERE id = 'task_kb90_backflush_pm'")
      .get() as { is_completed: number } | undefined;
    espressoBackflushCompleted = espressoTask?.is_completed === 1;
  } catch (err) {
    console.warn('[CFR Z-Report] Equipment telemetry query error:', err);
  }

  const dateCompact = businessDate.replace(/-/g, '');
  const reportNumber = `Z-${dateCompact}-001`;

  return {
    report_number: reportNumber,
    business_date: businessDate,
    generated_at: now,
    store: {
      name: 'Coffee First Ritual',
      brand: 'CFR Coffee Specialty Roasters',
      location: 'Urban Estate, Sector 12, Karnal, Haryana',
      gstin: '06ABCDE1234F1Z5',
      fssai: '10824005000123',
    },
    financials: {
      gross_sales_paise: grossSalesPaise,
      discounts_paise: 0,
      net_taxable_paise: netTaxablePaise,
      cgst_paise: cgstPaise,
      sgst_paise: sgstPaise,
      total_gst_paise: totalGstPaise,
      roundoff_paise: roundoffPaise,
      net_payable_paise: netPayablePaise,
    },
    payments: paymentSplits,
    operations: {
      total_orders: totalOrdersCount,
      total_cups_served: cupsServed,
      average_ticket_paise: avgTicketPaise,
      cancelled_orders_count: 0,
      cancelled_amount_paise: 0,
      credit_notes_count: creditNotes.count,
      credit_notes_amount_paise: creditNotes.total,
    },
    cogs: {
      theoretical_cogs_paise: theoreticalCogsPaise,
      calibration_waste_paise: calibrationWastePaise,
      spillage_waste_paise: spillageWastePaise,
      total_cogs_paise: totalCogsPaise,
      food_cost_percentage: foodCostPercentage,
    },
    cash_drawer: {
      opening_float_paise: openingFloatPaise,
      cash_sales_paise: totalCashSalesPaise,
      cash_payouts_paise: cashPayoutsPaise,
      expected_drawer_cash_paise: expectedDrawerCashPaise,
      actual_counted_cash_paise: actualCounted,
      cash_variance_paise: cashVariancePaise,
      is_balanced: isBalanced,
    },
    equipment_status: {
      active_bean_lot: activeLotName,
      active_bean_stage: activeLotStage,
      days_off_roast: daysOffRoast,
      grinder_wear_kg: grinderWearKg,
      grinder_status: grinderStatus,
      oven_wash_completed: ovenWashCompleted,
      espresso_backflush_completed: espressoBackflushCompleted,
    },
  };
}

/**
 * Formats a clean 80mm ESC/POS thermal text slip for printing the end-of-day Z-Report.
 */
export function formatZReportThermalReceipt(report: CfrDailyZReport): string {
  const line = '─'.repeat(42);
  const doubleLine = '═'.repeat(42);
  const pad = (left: string, right: string, width = 42) => {
    const space = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(space) + right;
  };
  const center = (text: string, width = 42) => {
    const leftPad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(leftPad) + text;
  };

  const toRs = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

  const lines: string[] = [
    doubleLine,
    center('COFFEE FIRST RITUAL'),
    center('END-OF-DAY Z-REPORT'),
    center(report.store.location),
    center(`GSTIN: ${report.store.gstin} | FSSAI: ${report.store.fssai}`),
    doubleLine,
    pad(`Report: ${report.report_number}`, `Date: ${report.business_date}`),
    pad(`Generated: ${new Date(report.generated_at).toLocaleTimeString()}`, 'SAC: 996331'),
    line,
    center('FINANCIAL SALES SUMMARY'),
    line,
    pad('Gross Taxable Sales:', toRs(report.financials.net_taxable_paise)),
    pad('CGST (2.5%):', toRs(report.financials.cgst_paise)),
    pad('SGST (2.5%):', toRs(report.financials.sgst_paise)),
    pad('Total Haryana GST (5%):', toRs(report.financials.total_gst_paise)),
    pad('Round-off Adjustment:', toRs(report.financials.roundoff_paise)),
    line,
    pad('TOTAL NET PAYABLE:', toRs(report.financials.net_payable_paise)),
    doubleLine,
    center('PAYMENT METHOD RECONCILIATION'),
    line,
  ];

  for (const pay of report.payments) {
    if (pay.amount_paise > 0 || pay.count > 0) {
      lines.push(pad(`${pay.method} (${pay.count} txns):`, toRs(pay.amount_paise)));
    }
  }

  lines.push(
    line,
    center('CASH DRAWER RECONCILIATION'),
    line,
    pad('Opening Cash Float:', toRs(report.cash_drawer.opening_float_paise)),
    pad('Cash Sales Added:', toRs(report.cash_drawer.cash_sales_paise)),
    pad('Cash Payouts/Expenses:', `-${toRs(report.cash_drawer.cash_payouts_paise)}`),
    line,
    pad('EXPECTED IN DRAWER:', toRs(report.cash_drawer.expected_drawer_cash_paise)),
  );

  if (report.cash_drawer.actual_counted_cash_paise !== null && report.cash_drawer.actual_counted_cash_paise !== undefined) {
    lines.push(
      pad('Actual Counted Cash:', toRs(report.cash_drawer.actual_counted_cash_paise)),
      pad('Cash Variance (Over/Short):', toRs(report.cash_drawer.cash_variance_paise || 0)),
      pad('Drawer Status:', report.cash_drawer.is_balanced ? 'BALANCED (PERFECT)' : 'DISCREPANCY DETECTED'),
    );
  }

  lines.push(
    line,
    center('INVENTORY & FOOD COST (COGS)'),
    line,
    pad('Theoretical BOM COGS:', toRs(report.cogs.theoretical_cogs_paise)),
    pad('Calibration Waste (Dial-in):', toRs(report.cogs.calibration_waste_paise)),
    pad('Spillage / Expired Waste:', toRs(report.cogs.spillage_waste_paise)),
    line,
    pad('Total Depleted COGS:', toRs(report.cogs.total_cogs_paise)),
    pad('Food Cost Percentage:', `${report.cogs.food_cost_percentage}%`),
    line,
    center('EQUIPMENT & CLOSING CHECKLIST'),
    line,
    pad('Active Bean Lot:', report.equipment_status.active_bean_lot || 'Standard'),
    pad('Roast Age:', `${report.equipment_status.days_off_roast ?? 0} days (${report.equipment_status.active_bean_stage || 'PEAK'})`),
    pad('Grinder Burr Lifespan:', `${report.equipment_status.grinder_wear_kg} kg (${report.equipment_status.grinder_status})`),
    pad('Unox Combi Wash (Rotor.KLEAN):', report.equipment_status.oven_wash_completed ? 'COMPLETED [OK]' : 'PENDING'),
    pad('KB90 Chemical Backflush:', report.equipment_status.espresso_backflush_completed ? 'COMPLETED [OK]' : 'PENDING'),
    doubleLine,
    center('100% VEGETARIAN & ARTISANAL EGGLESS'),
    center('End of Official Business Day'),
    doubleLine,
    '\n\n',
  );

  return lines.join('\n');
}
