'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Download,
  Printer,
  ShieldCheck,
  RefreshCw,
  Coins,
  Receipt,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Coffee,
  Flame,
  Database,
  History,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ZReportData {
  report_number: string;
  business_date: string;
  generated_at: string;
  store: {
    name: string;
    location: string;
    gstin: string;
    fssai: string;
    state_code: string;
  };
  financials: {
    gross_sales_paise: number;
    net_taxable_paise: number;
    cgst_paise: number;
    sgst_paise: number;
    total_gst_paise: number;
    roundoff_paise: number;
    net_payable_paise: number;
  };
  payments: Array<{
    method: string;
    count: number;
    amount_paise: number;
  }>;
  operations: {
    total_orders: number;
    total_cups_served: number;
    average_ticket_paise: number;
    cancelled_orders_count: number;
    cancelled_amount_paise: number;
    credit_notes_count: number;
    credit_notes_amount_paise: number;
  };
  cogs: {
    theoretical_cogs_paise: number;
    calibration_waste_paise: number;
    spillage_waste_paise: number;
    total_cogs_paise: number;
    food_cost_percentage: number;
  };
  cash_drawer: {
    opening_float_paise: number;
    cash_sales_paise: number;
    cash_payouts_paise: number;
    expected_drawer_cash_paise: number;
    actual_counted_cash_paise: number | null;
    cash_variance_paise: number | null;
    is_balanced: boolean;
  };
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

interface BackupRecord {
  file_name: string;
  file_path: string;
  size_bytes: number;
  size_formatted: string;
  integrity_status: string;
  created_at: string;
}

function getInitialToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { error?: string } } }).response;
    if (res?.data?.error) return res.data.error;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function ReportsPage() {
  const [selectedDate, setSelectedDate] = useState<string>(getInitialToday);
  const [openingFloatRupees, setOpeningFloatRupees] = useState<string>('5000');
  const [countedCashRupees, setCountedCashRupees] = useState<string>('');
  const [report, setReport] = useState<ZReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [runningBackup, setRunningBackup] = useState<boolean>(false);
  const [thermalReceiptText, setThermalReceiptText] = useState<string | null>(null);
  const [showThermalModal, setShowThermalModal] = useState<boolean>(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const openingPaise = Math.round((parseFloat(openingFloatRupees) || 0) * 100);
      const countedPaise = countedCashRupees.trim() !== ''
        ? Math.round(parseFloat(countedCashRupees) * 100)
        : undefined;

      const params: Record<string, string | number> = {
        date: selectedDate,
        opening_float_paise: openingPaise,
      };
      if (countedPaise !== undefined) {
        params.actual_counted_cash_paise = countedPaise;
      }

      const res = await api.get('/cfr/reports/z-report', { params });
      setReport(res.data?.report || res.data);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to load Z-Report'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, openingFloatRupees, countedCashRupees]);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await api.get('/cfr/backup/list');
      setBackups(res.data?.backups || []);
    } catch {
      // Non-critical background failure
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      await fetchReport();
      if (active) {
        await fetchBackups();
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [fetchReport, fetchBackups]);

  const handleDownloadCsv = () => {
    const url = `/api/cfr/reports/gst-export?start_date=${selectedDate}&end_date=${selectedDate}&format=csv`;
    window.open(url, '_blank');
  };

  const handleOpenThermalModal = async () => {
    try {
      const openingPaise = Math.round((parseFloat(openingFloatRupees) || 0) * 100);
      const countedPaise = countedCashRupees.trim() !== ''
        ? Math.round(parseFloat(countedCashRupees) * 100)
        : undefined;

      const params: Record<string, string | number> = {
        date: selectedDate,
        opening_float_paise: openingPaise,
      };
      if (countedPaise !== undefined) {
        params.actual_counted_cash_paise = countedPaise;
      }

      const res = await api.get('/cfr/reports/z-report/thermal', { params });
      setThermalReceiptText(res.data?.receipt_text || '');
      setShowThermalModal(true);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to generate thermal receipt'));
    }
  };

  const handleRunBackup = async () => {
    setRunningBackup(true);
    try {
      const res = await api.post('/cfr/backup/run');
      toast.success(res.data?.message || 'Pristine database snapshot created!');
      await fetchBackups();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Safe backup failed'));
    } finally {
      setRunningBackup(false);
    }
  };

  const toRs = (paise: number) => `₹${((paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto">
      {/* Top Banner / Store Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 border border-amber-900/40 rounded-2xl p-6 text-stone-100 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
              CFR OS • Compliance Engine
            </span>
            <span className="text-xs text-stone-400">
              Haryana (06) • SAC 996331
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold tracking-tight text-white flex items-center gap-2">
            End-of-Day Z-Report & CA Audit Center
          </h1>
          <p className="text-stone-400 text-sm mt-1">
            Coffee First Ritual Gurugram • Gap-Free GST Ledger, Food Cost Variance & Non-Locking SQLite Snapshots
          </p>
        </div>

        {/* Top Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-stone-950/80 border border-stone-800 rounded-xl px-3 py-1.5 shadow-inner">
            <Calendar className="w-4 h-4 text-amber-400 mr-2" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm text-stone-200 outline-none cursor-pointer"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchReport}
            disabled={loading}
            className="border-stone-700 bg-stone-800/80 hover:bg-stone-700 text-stone-200"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadCsv}
            className="border-emerald-700/60 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300"
          >
            <Download className="w-4 h-4 mr-1.5" />
            GSTR-1 CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenThermalModal}
            className="border-amber-700/60 bg-amber-950/30 hover:bg-amber-900/40 text-amber-300"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            80mm Slip
          </Button>

          <Button
            size="sm"
            onClick={handleRunBackup}
            disabled={runningBackup}
            className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold shadow-lg shadow-amber-900/20"
          >
            <ShieldCheck className={`w-4 h-4 mr-1.5 ${runningBackup ? 'animate-spin' : ''}`} />
            {runningBackup ? 'Snapshotting...' : 'Safe Backup'}
          </Button>
        </div>
      </div>

      {loading && !report ? (
        <div className="flex flex-col items-center justify-center p-16 text-stone-400 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-sm font-medium">Aggregating day invoices, food costs and closing ledger...</p>
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* 1. Main Financial Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Net Taxable */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-stone-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <span>Net Taxable Sales</span>
                <Receipt className="w-4 h-4 text-stone-500" />
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {toRs(report.financials.net_taxable_paise)}
              </div>
              <div className="text-xs text-stone-400 mt-1">
                Haryana SAC 996331 Restaurant Base
              </div>
            </div>

            {/* Total GST */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-stone-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <span>Total 5% GST</span>
                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">
                  CGST + SGST
                </span>
              </div>
              <div className="text-2xl font-bold text-amber-400 font-mono">
                {toRs(report.financials.total_gst_paise)}
              </div>
              <div className="text-xs text-stone-400 mt-1 flex justify-between">
                <span>CGST (2.5%): {toRs(report.financials.cgst_paise)}</span>
                <span>SGST (2.5%): {toRs(report.financials.sgst_paise)}</span>
              </div>
            </div>

            {/* Net Payable */}
            <div className="bg-gradient-to-br from-amber-950/40 via-stone-900 to-stone-900 border border-amber-700/40 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-amber-300 text-xs font-semibold uppercase tracking-wider mb-2">
                <span>Net Payable Revenue</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {toRs(report.financials.net_payable_paise)}
              </div>
              <div className="text-xs text-amber-200/70 mt-1">
                Round-off: {report.financials.roundoff_paise >= 0 ? `+${report.financials.roundoff_paise}p` : `${report.financials.roundoff_paise}p`}
              </div>
            </div>

            {/* Average Ticket / Order Count */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-stone-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <span>Guest Operations</span>
                <Coffee className="w-4 h-4 text-stone-500" />
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {toRs(report.operations.average_ticket_paise)}
              </div>
              <div className="text-xs text-stone-400 mt-1 flex justify-between">
                <span>{report.operations.total_orders} Orders</span>
                <span>{report.operations.total_cups_served} Cups Served</span>
              </div>
            </div>
          </div>

          {/* 2. Middle Row: Cash Drawer Reconciliation & Payment Splits */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cash Drawer Balancing (2 cols) */}
            <div className="lg:col-span-2 bg-stone-900/90 border border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">Cash Drawer Shift Balancing</h2>
                </div>
                {report.cash_drawer.actual_counted_cash_paise !== null && (
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                      report.cash_drawer.is_balanced
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {report.cash_drawer.is_balanced ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        BALANCED (PERFECT)
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        VARIANCE: {toRs(report.cash_drawer.cash_variance_paise || 0)}
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Math Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-stone-950/60 rounded-lg border border-stone-800">
                  <div className="text-xs text-stone-400 mb-1">Opening Float</div>
                  <div className="text-base font-bold text-stone-200 font-mono">
                    {toRs(report.cash_drawer.opening_float_paise)}
                  </div>
                </div>
                <div className="p-3 bg-stone-950/60 rounded-lg border border-stone-800">
                  <div className="text-xs text-stone-400 mb-1">+ Cash Sales</div>
                  <div className="text-base font-bold text-emerald-400 font-mono">
                    +{toRs(report.cash_drawer.cash_sales_paise)}
                  </div>
                </div>
                <div className="p-3 bg-stone-950/60 rounded-lg border border-stone-800">
                  <div className="text-xs text-stone-400 mb-1">- Cash Payouts</div>
                  <div className="text-base font-bold text-rose-400 font-mono">
                    -{toRs(report.cash_drawer.cash_payouts_paise)}
                  </div>
                </div>
                <div className="p-3 bg-amber-950/30 rounded-lg border border-amber-800/40">
                  <div className="text-xs text-amber-300 mb-1">= Expected Cash</div>
                  <div className="text-base font-bold text-amber-200 font-mono">
                    {toRs(report.cash_drawer.expected_drawer_cash_paise)}
                  </div>
                </div>
              </div>

              {/* Live Counted Cash Input & Controls */}
              <div className="p-4 bg-stone-950/80 rounded-xl border border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex-1 w-full space-y-1">
                  <label className="text-xs font-semibold text-stone-300">
                    Physical Drawer Count (₹ Rupees):
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 text-sm font-bold">₹</span>
                    <input
                      type="number"
                      placeholder="e.g. 5672.00"
                      value={countedCashRupees}
                      onChange={(e) => setCountedCashRupees(e.target.value)}
                      className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-white font-mono text-sm w-full max-w-xs focus:outline-none focus:border-amber-500"
                    />
                    <Button
                      size="sm"
                      onClick={fetchReport}
                      className="bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700"
                    >
                      Reconcile
                    </Button>
                  </div>
                </div>

                <div className="text-right w-full md:w-auto">
                  <div className="text-xs text-stone-400">Shift Opening Float Config</div>
                  <div className="flex items-center gap-1.5 justify-end mt-1">
                    <span className="text-xs text-stone-400">Float: ₹</span>
                    <input
                      type="number"
                      value={openingFloatRupees}
                      onChange={(e) => setOpeningFloatRupees(e.target.value)}
                      className="bg-stone-900 border border-stone-700 rounded px-2 py-0.5 text-xs text-stone-200 font-mono w-20 text-right"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Splits Breakdown */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">Payment Method Splits</h2>
                </div>
              </div>

              <div className="space-y-3">
                {report.payments.map((p) => (
                  <div
                    key={p.method}
                    className="flex items-center justify-between p-3 bg-stone-950/60 rounded-lg border border-stone-800 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-stone-200">{p.method}</div>
                      <div className="text-xs text-stone-400">{p.count} transactions</div>
                    </div>
                    <div className="font-mono font-bold text-stone-100">
                      {toRs(p.amount_paise)}
                    </div>
                  </div>
                ))}
              </div>

              {report.operations.credit_notes_count > 0 && (
                <div className="p-3 bg-rose-950/20 border border-rose-800/30 rounded-lg text-xs text-rose-300 flex items-center justify-between">
                  <span>Credit Notes Issued: {report.operations.credit_notes_count}</span>
                  <span className="font-mono font-bold">-{toRs(report.operations.credit_notes_amount_paise)}</span>
                </div>
              )}
            </div>
          </div>

          {/* 3. Bottom Row: Inventory Food Cost & Equipment Checklist */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inventory COGS & Food Cost % */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">Inventory Depletion & Food Cost %</h2>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    report.cogs.food_cost_percentage <= 28
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  Food Cost: {report.cogs.food_cost_percentage}%
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm py-1.5 border-b border-stone-850">
                  <span className="text-stone-400">Theoretical BOM Recipe COGS</span>
                  <span className="font-mono text-stone-200">{toRs(report.cogs.theoretical_cogs_paise)}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1.5 border-b border-stone-850">
                  <span className="text-stone-400">Barista Dial-in Calibration Waste</span>
                  <span className="font-mono text-amber-400">+{toRs(report.cogs.calibration_waste_paise)}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1.5 border-b border-stone-850">
                  <span className="text-stone-400">Spillage / Expired Ingredient Waste</span>
                  <span className="font-mono text-rose-400">+{toRs(report.cogs.spillage_waste_paise)}</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-2 font-bold">
                  <span className="text-stone-200">Total Depleted Inventory COGS</span>
                  <span className="font-mono text-white text-base">{toRs(report.cogs.total_cogs_paise)}</span>
                </div>
              </div>

              <div className="text-xs text-stone-500 flex items-center gap-1.5 pt-2">
                <Info className="w-3.5 h-3.5" />
                Target artisanal food cost benchmark: 22.0% – 28.0% of net taxable sales.
              </div>
            </div>

            {/* Equipment Closing Checklist */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">Specialty Coffee & Equipment Health</h2>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="p-3 bg-stone-950/60 rounded-lg border border-stone-800 flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-stone-200">
                      {report.equipment_status.active_bean_lot || 'Standard Espresso Blend'}
                    </div>
                    <div className="text-xs text-stone-400">
                      Roast age: {report.equipment_status.days_off_roast ?? 0} days off roast
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {report.equipment_status.active_bean_stage || 'PEAK'}
                  </span>
                </div>

                <div className="p-3 bg-stone-950/60 rounded-lg border border-stone-800 flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-stone-200">Mahlkönig E65S Burrs</div>
                    <div className="text-xs text-stone-400">
                      {report.equipment_status.grinder_wear_kg} kg cumulative ground
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {report.equipment_status.grinder_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-stone-950/60 rounded-lg border border-stone-800 flex items-center justify-between">
                    <span className="text-xs text-stone-300">Unox Combi Wash</span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        report.equipment_status.oven_wash_completed
                          ? 'text-emerald-400 bg-emerald-950/40'
                          : 'text-stone-400 bg-stone-900'
                      }`}
                    >
                      {report.equipment_status.oven_wash_completed ? 'DONE' : 'PENDING'}
                    </span>
                  </div>
                  <div className="p-3 bg-stone-950/60 rounded-lg border border-stone-800 flex items-center justify-between">
                    <span className="text-xs text-stone-300">KB90 Backflush</span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        report.equipment_status.espresso_backflush_completed
                          ? 'text-emerald-400 bg-emerald-950/40'
                          : 'text-stone-400 bg-stone-900'
                      }`}
                    >
                      {report.equipment_status.espresso_backflush_completed ? 'DONE' : 'PENDING'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Safe Online SQLite Snapshots Audit Table */}
          <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-lg font-bold text-white">Safe SQLite Snapshots (VACUUM INTO)</h2>
                  <p className="text-xs text-stone-400">Non-locking online hot backups with PRAGMA integrity_check validation</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchBackups}
                className="border-stone-700 bg-stone-800 text-stone-200 text-xs"
              >
                <History className="w-3.5 h-3.5 mr-1" />
                Refresh List
              </Button>
            </div>

            {backups.length === 0 ? (
              <div className="p-8 text-center text-stone-400 text-sm">
                No local snapshots created yet. Click &quot;Safe Backup&quot; above to generate a verified hot snapshot.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-950/60 text-stone-400 uppercase tracking-wider font-semibold border-b border-stone-800">
                    <tr>
                      <th className="py-2.5 px-3">Snapshot Filename</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3">Integrity Check</th>
                      <th className="py-2.5 px-3">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-850">
                    {backups.map((b) => (
                      <tr key={b.file_name} className="hover:bg-stone-850/50">
                        <td className="py-2.5 px-3 font-mono text-stone-200">{b.file_name}</td>
                        <td className="py-2.5 px-3 text-stone-400">{b.size_formatted}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                              b.integrity_status.toLowerCase() === 'ok'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {b.integrity_status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-stone-400">
                          {new Date(b.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 80mm ESC/POS Thermal Slip Modal */}
      {showThermalModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">80mm Thermal Z-Report Slip</h3>
              </div>
              <button
                onClick={() => setShowThermalModal(false)}
                className="text-stone-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 font-mono text-xs text-stone-300 max-h-96 overflow-y-auto whitespace-pre leading-relaxed select-all">
              {thermalReceiptText}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (thermalReceiptText) {
                    navigator.clipboard.writeText(thermalReceiptText);
                    toast.success('Thermal receipt text copied to clipboard!');
                  }
                }}
                className="border-stone-700 text-stone-300 hover:bg-stone-800"
              >
                Copy Text
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  window.print();
                }}
                className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold"
              >
                Print Slip
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
