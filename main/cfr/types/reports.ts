/**
 * CFR OS: Week 7 Types
 * Daily Z-Report, Shift Balancing, Accountant GST Export & Database Backup
 */

export interface CfrZReportFinancials {
  gross_sales_paise: number;
  discounts_paise: number;
  net_taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  total_gst_paise: number;
  roundoff_paise: number;
  net_payable_paise: number;
}

export interface CfrZReportPaymentSplit {
  method: string;
  count: number;
  amount_paise: number;
}

export interface CfrZReportOperations {
  total_orders: number;
  total_cups_served: number;
  average_ticket_paise: number;
  cancelled_orders_count: number;
  cancelled_amount_paise: number;
  credit_notes_count: number;
  credit_notes_amount_paise: number;
}

export interface CfrZReportCogs {
  theoretical_cogs_paise: number;
  calibration_waste_paise: number;
  spillage_waste_paise: number;
  total_cogs_paise: number;
  food_cost_percentage: number;
}

export interface CfrZReportCashReconciliation {
  opening_float_paise: number;
  cash_sales_paise: number;
  cash_payouts_paise: number;
  expected_drawer_cash_paise: number;
  actual_counted_cash_paise?: number | null;
  cash_variance_paise?: number | null;
  is_balanced: boolean;
}

export interface CfrDailyZReport {
  report_number: string;
  business_date: string;
  generated_at: string;
  store: {
    name: string;
    brand: string;
    location: string;
    gstin: string;
    fssai: string;
  };
  financials: CfrZReportFinancials;
  payments: CfrZReportPaymentSplit[];
  operations: CfrZReportOperations;
  cogs: CfrZReportCogs;
  cash_drawer: CfrZReportCashReconciliation;
  equipment_status: {
    active_bean_lot: string | null;
    active_bean_stage: string | null;
    days_off_roast: number | null;
    grinder_wear_kg: number;
    grinder_status: string;
    oven_wash_completed: boolean;
    espresso_backflush_completed: boolean;
  };
}

export interface CfrBackupMetadata {
  file_name: string;
  file_path: string;
  size_bytes: number;
  created_at: string;
  integrity_status: string;
}
