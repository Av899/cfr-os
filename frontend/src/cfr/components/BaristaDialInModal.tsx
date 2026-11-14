'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Coffee,
  Gauge,
  Sliders,
  History,
  CheckCircle2,
  RotateCcw,
  Layers,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export interface CfrFreshnessStatus {
  stage: 'DEGASSING' | 'PEAK' | 'FADING' | 'STALE';
  days_off_roast: number;
  degas_days: number;
  peak_days: number;
  label: string;
  badge_color: 'amber' | 'emerald' | 'orange' | 'rose';
  guidance: string;
}

export interface CfrBeanLot {
  id: string;
  roaster_name: string;
  lot_name: string;
  origin: string;
  process: string;
  roast_date: string;
  initial_weight_g: number;
  remaining_weight_g: number;
  degas_days: number;
  peak_days: number;
  is_active: number;
  created_at: string;
  freshness: CfrFreshnessStatus;
}

export interface CfrGrinder {
  id: string;
  name: string;
  model: string;
  burr_type: string;
  burr_capacity_kg: number;
  cumulative_ground_g: number;
  cumulative_ground_kg: number;
  wear_percentage: number;
  remaining_capacity_kg: number;
  status: 'GOOD' | 'INSPECTION_DUE' | 'REPLACEMENT_REQUIRED';
}

export interface CfrDialInRecord {
  id: string;
  bean_lot_id: string;
  dose_grams: number;
  yield_grams: number;
  time_seconds: number;
  grind_setting: string;
  waste_grams: number;
  tasting_notes?: string | null;
  barista_name?: string | null;
  created_at: string;
  ratio: number;
  flow_rate_gps: number;
  bean_name?: string;
  roaster_name?: string;
}

interface BaristaDialInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDialInLogged?: () => void;
}

export function BaristaDialInModal({ isOpen, onClose, onDialInLogged }: BaristaDialInModalProps) {
  const [activeLot, setActiveLot] = useState<CfrBeanLot | null>(null);
  const [allLots, setAllLots] = useState<CfrBeanLot[]>([]);
  const [grinder, setGrinder] = useState<CfrGrinder | null>(null);
  const [latestDialIn, setLatestDialIn] = useState<CfrDialInRecord | null>(null);
  const [dialInHistory, setDialInHistory] = useState<CfrDialInRecord[]>([]);

  // Form Inputs
  const [dose, setDose] = useState<number>(18.5);
  const [liquidYield, setLiquidYield] = useState<number>(38.0);
  const [timeSeconds, setTimeSeconds] = useState<number>(28);
  const [grindSetting, setGrindSetting] = useState<string>('2.4');
  const [tastingNotes, setTastingNotes] = useState<string>('Jasmine, Stone Fruit, High Sweetness, Crisp Citric Crema');
  const [baristaName, setBaristaName] = useState<string>('Lead Barista');

  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'calibrate' | 'lots' | 'history'>('calibrate');
  const [refreshKey, setRefreshKey] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [lotRes, dialRes, histRes, grindRes] = await Promise.all([
          api.get('/cfr/coffee/lots'),
          api.get('/cfr/coffee/dial-in/latest'),
          api.get('/cfr/coffee/dial-in/history?limit=10'),
          api.get('/cfr/coffee/grinder/wear'),
        ]);

        if (!active) return;

        const lots: CfrBeanLot[] = lotRes.data?.lots || [];
        setAllLots(lots);
        const activeItem = lots.find((l) => l.is_active === 1) || lots[0] || null;
        setActiveLot(activeItem);

        if (dialRes.data?.latest) {
          const rec: CfrDialInRecord = dialRes.data.latest;
          setLatestDialIn(rec);
          setDose(rec.dose_grams || 18.5);
          setLiquidYield(rec.yield_grams || 38.0);
          setTimeSeconds(rec.time_seconds || 28);
          setGrindSetting(rec.grind_setting || '2.4');
        }

        setDialInHistory(histRes.data?.history || []);
        setGrinder(grindRes.data?.grinder || null);
      } catch (err: unknown) {
        if (!active) return;
        console.error('[CFR Coffee Modal] Failed to load data:', err);
        toast.error('Failed to load specialty coffee calibration data');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [isOpen, refreshKey]);

  if (!isOpen) return null;

  // Real-time extraction calculations
  const calculatedRatio = dose > 0 ? Math.round((liquidYield / dose) * 100) / 100 : 0;
  const calculatedFlowRate = timeSeconds > 0 ? Math.round((liquidYield / timeSeconds) * 100) / 100 : 0;

  // Extraction diagnosis
  let diagnosis = 'Balanced Specialty Sweetness & Acidity';
  let diagnosisColor = 'text-emerald-500';
  if (calculatedRatio < 1.8) {
    diagnosis = 'Short / Ristretto Profile (High Intensity, Concentrated Acidity)';
    diagnosisColor = 'text-amber-500';
  } else if (calculatedRatio > 2.4) {
    diagnosis = 'Lungo / Extended Yield (Higher Bitterness & Dryness Risk)';
    diagnosisColor = 'text-orange-500';
  } else if (timeSeconds < 22) {
    diagnosis = 'Fast Extraction / Under-Extraction Risk (Channeling or Grind Too Coarse)';
    diagnosisColor = 'text-amber-500';
  } else if (timeSeconds > 34) {
    diagnosis = 'Slow Extraction / Over-Extraction Risk (Grind Too Fine or Over-Tamped)';
    diagnosisColor = 'text-orange-500';
  }

  const handleLogDialIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLot) {
      toast.error('Please select or register an active coffee lot');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/cfr/coffee/dial-in', {
        bean_lot_id: activeLot.id,
        dose_grams: dose,
        yield_grams: liquidYield,
        time_seconds: timeSeconds,
        grind_setting: grindSetting,
        waste_grams: dose,
        tasting_notes: tastingNotes,
        barista_name: baristaName,
      });

      toast.success(`Calibration logged! Brew Ratio: 1:${res.data.record.ratio}`);
      setLatestDialIn(res.data.record);
      onDialInLogged?.();
      setRefreshKey((k) => k + 1);
      setActiveTab('calibrate');
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = errorObj.response?.data?.error || errorObj.message || 'Failed to log dial-in calibration';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivateLot = async (lotId: string) => {
    try {
      await api.patch(`/cfr/coffee/lots/${lotId}/activate`);
      toast.success('Active hopper coffee bean updated!');
      setRefreshKey((k) => k + 1);
      onDialInLogged?.();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(errorObj.response?.data?.error || errorObj.message || 'Failed to activate lot');
    }
  };

  const handleResetBurrs = async () => {
    if (!grinder) return;
    if (!window.confirm(`Reset burr wear counter to 0kg for ${grinder.name}?`)) {
      return;
    }
    try {
      const res = await api.post('/cfr/coffee/grinder/reset', { grinder_id: grinder.id });
      toast.success(res.data?.message || 'Grinder burr wear reset!');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(errorObj.response?.data?.error || errorObj.message || 'Failed to reset burr counter');
    }
  };

  const renderBadge = (status?: CfrFreshnessStatus) => {
    if (!status) return null;
    const colorClasses = {
      emerald: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
      amber: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
      orange: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
      rose: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
    }[status.badge_color];

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        {status.label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-card border border-border shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">Barista Morning Dial-in & Freshness</h2>
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                  CFR Specialty Engine
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Roast age degassing tracking, espresso extraction calibration & burr lifespan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border bg-card px-6 pt-2">
          <button
            onClick={() => setActiveTab('calibrate')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'calibrate'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Calibration Logger
          </button>
          <button
            onClick={() => setActiveTab('lots')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'lots'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="w-4 h-4" />
            Bean Lots & Degassing ({allLots.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-4 h-4" />
            Dial-In History ({dialInHistory.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {/* Active Hopper Bean Card */}
          {activeLot && (
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Active Hopper Lot
                    </span>
                    {renderBadge(activeLot.freshness)}
                  </div>
                  <h3 className="text-base font-bold text-foreground mt-0.5">{activeLot.lot_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {activeLot.roaster_name} • {activeLot.origin} ({activeLot.process})
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium text-muted-foreground">Roast Date</div>
                  <div className="text-sm font-mono font-bold text-foreground">{activeLot.roast_date}</div>
                  <div className="text-xs text-muted-foreground">
                    Hopper: <span className="font-semibold text-foreground">{activeLot.remaining_weight_g}g</span> remaining
                  </div>
                </div>
              </div>

              {/* Freshness Guidance Notice */}
              <div className="flex items-center gap-2 rounded-lg bg-card border border-border/60 p-2.5 text-xs text-muted-foreground">
                <Flame className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{activeLot.freshness.guidance}</span>
              </div>
            </div>
          )}

          {/* Tab 1: Calibration Logger Form */}
          {activeTab === 'calibrate' && (
            <form onSubmit={handleLogDialIn} className="space-y-6">
              {latestDialIn && (
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 px-3.5 py-2 rounded-lg border border-border/60">
                  <span>Current Dial-in Profile:</span>
                  <span className="font-mono font-semibold text-foreground">
                    1:{latestDialIn.ratio} ({latestDialIn.dose_grams}g in / {latestDialIn.yield_grams}g out @ {latestDialIn.time_seconds}s, Grind: {latestDialIn.grind_setting})
                  </span>
                </div>
              )}

              {/* Dial-in Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Dose */}
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">Dry Dose</span>
                    <span className="font-mono">10–30g</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="10"
                      max="30"
                      required
                      value={dose}
                      onChange={(e) => setDose(parseFloat(e.target.value) || 0)}
                      className="w-full text-2xl font-bold font-mono bg-transparent border-none p-0 focus:outline-none text-foreground"
                    />
                    <span className="text-sm text-muted-foreground font-semibold">g</span>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setDose((d) => Math.max(10, Math.round((d - 0.5) * 10) / 10))}
                      className="flex-1 py-1 rounded bg-muted hover:bg-muted/80 text-xs font-bold font-mono transition-colors"
                    >
                      -0.5
                    </button>
                    <button
                      type="button"
                      onClick={() => setDose((d) => Math.min(30, Math.round((d + 0.5) * 10) / 10))}
                      className="flex-1 py-1 rounded bg-muted hover:bg-muted/80 text-xs font-bold font-mono transition-colors"
                    >
                      +0.5
                    </button>
                  </div>
                </div>

                {/* Yield */}
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">Liquid Yield</span>
                    <span className="font-mono">15–90g</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="15"
                      max="90"
                      required
                      value={liquidYield}
                      onChange={(e) => setLiquidYield(parseFloat(e.target.value) || 0)}
                      className="w-full text-2xl font-bold font-mono bg-transparent border-none p-0 focus:outline-none text-foreground"
                    />
                    <span className="text-sm text-muted-foreground font-semibold">g</span>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setLiquidYield((y) => Math.max(15, Math.round((y - 1) * 10) / 10))}
                      className="flex-1 py-1 rounded bg-muted hover:bg-muted/80 text-xs font-bold font-mono transition-colors"
                    >
                      -1.0
                    </button>
                    <button
                      type="button"
                      onClick={() => setLiquidYield((y) => Math.min(90, Math.round((y + 1) * 10) / 10))}
                      className="flex-1 py-1 rounded bg-muted hover:bg-muted/80 text-xs font-bold font-mono transition-colors"
                    >
                      +1.0
                    </button>
                  </div>
                </div>

                {/* Extraction Time */}
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">Extraction Time</span>
                    <span className="font-mono">10–60s</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <input
                      type="number"
                      step="1"
                      min="10"
                      max="60"
                      required
                      value={timeSeconds}
                      onChange={(e) => setTimeSeconds(parseInt(e.target.value, 10) || 0)}
                      className="w-full text-2xl font-bold font-mono bg-transparent border-none p-0 focus:outline-none text-foreground"
                    />
                    <span className="text-sm text-muted-foreground font-semibold">s</span>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setTimeSeconds((t) => Math.max(10, t - 1))}
                      className="flex-1 py-1 rounded bg-muted hover:bg-muted/80 text-xs font-bold font-mono transition-colors"
                    >
                      -1s
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeSeconds((t) => Math.min(60, t + 1))}
                      className="flex-1 py-1 rounded bg-muted hover:bg-muted/80 text-xs font-bold font-mono transition-colors"
                    >
                      +1s
                    </button>
                  </div>
                </div>

                {/* Grind Setting */}
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">Grind Setting</span>
                    <span className="font-mono">Mahlkönig</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={grindSetting}
                    onChange={(e) => setGrindSetting(e.target.value)}
                    placeholder="e.g. 2.4"
                    className="w-full text-2xl font-bold font-mono bg-transparent border-none p-0 focus:outline-none text-foreground"
                  />
                  <div className="text-[11px] text-muted-foreground pt-1 truncate">
                    Stepless collar / dial notch
                  </div>
                </div>
              </div>

              {/* Real-time Computed Extraction Banner */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-xs text-muted-foreground block">Brew Ratio</span>
                    <span className="text-xl font-extrabold font-mono text-primary">
                      1 : {calculatedRatio}
                    </span>
                  </div>
                  <div className="h-8 w-px bg-border/80" />
                  <div>
                    <span className="text-xs text-muted-foreground block">Flow Rate</span>
                    <span className="text-xl font-extrabold font-mono text-foreground">
                      {calculatedFlowRate} <span className="text-xs font-normal text-muted-foreground">g/s</span>
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-muted-foreground block">Sensory Diagnosis</span>
                  <span className={`text-xs font-bold ${diagnosisColor}`}>{diagnosis}</span>
                </div>
              </div>

              {/* Tasting Notes & Barista Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Sensory & Tasting Notes</label>
                  <input
                    type="text"
                    value={tastingNotes}
                    onChange={(e) => setTastingNotes(e.target.value)}
                    placeholder="e.g. Jasmine, Stone Fruit, Honey sweetness, Crisp acidity"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Barista On Shift</label>
                  <input
                    type="text"
                    value={baristaName}
                    onChange={(e) => setBaristaName(e.target.value)}
                    placeholder="Barista Name"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* FEFO Waste Deduction Notice */}
              <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Logging this calibration deducts <strong>{dose}g</strong> from FEFO stock as zero-revenue calibration waste (<code>DIAL_IN_SHOT</code>).
                </span>
                <Button type="submit" disabled={submitting || loading} className="font-semibold">
                  {submitting ? 'Calibrating...' : 'Log Calibration Shot'}
                </Button>
              </div>
            </form>
          )}

          {/* Tab 2: Bean Lots & Degassing Curves */}
          {activeTab === 'lots' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-foreground">Registered Roaster Bean Lots</h4>
                <span className="text-xs text-muted-foreground">Specialty Degassing Windows: Day 0–6 Degas, Day 7–28 Peak</span>
              </div>

              <div className="space-y-3">
                {allLots.map((lot) => (
                  <div
                    key={lot.id}
                    className={`rounded-xl border p-4 transition-all ${
                      lot.is_active === 1
                        ? 'border-primary/50 bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{lot.lot_name}</span>
                          {lot.is_active === 1 && (
                            <Badge className="bg-primary text-primary-foreground text-[10px]">Active Hopper</Badge>
                          )}
                          {renderBadge(lot.freshness)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {lot.roaster_name} • {lot.origin} • {lot.process}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          Roast: {lot.roast_date} ({lot.freshness.days_off_roast} days off roast) • Remaining: {lot.remaining_weight_g}g
                        </p>
                      </div>

                      <div>
                        {lot.is_active === 1 ? (
                          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Mounted on Grinder
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleActivateLot(lot.id)}
                            className="text-xs font-semibold"
                          >
                            Mount to Hopper
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Dial-In History */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-foreground">Recent Dial-In Calibration Logs</h4>
              {dialInHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No calibration logs recorded yet today.</div>
              ) : (
                <div className="space-y-2">
                  {dialInHistory.map((rec) => (
                    <div key={rec.id} className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">
                          {rec.bean_name || 'Active Espresso'} ({rec.roaster_name})
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-muted-foreground font-mono">
                        <span>Dose: <strong>{rec.dose_grams}g</strong></span>
                        <span>Yield: <strong>{rec.yield_grams}g</strong></span>
                        <span>Time: <strong>{rec.time_seconds}s</strong></span>
                        <span>Ratio: <strong className="text-primary">1:{rec.ratio}</strong></span>
                        <span>Flow: <strong>{rec.flow_rate_gps} g/s</strong></span>
                        <span>Grind: <strong>{rec.grind_setting}</strong></span>
                      </div>
                      {rec.tasting_notes && (
                        <p className="text-muted-foreground italic">&ldquo;{rec.tasting_notes}&rdquo; — {rec.barista_name || 'Barista'}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Grinder Burr Wear Meter Footer Card */}
          {grinder && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground">
                    Grinder Burr Wear ({grinder.name} • {grinder.burr_type})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-foreground">
                    {grinder.cumulative_ground_kg} / {grinder.burr_capacity_kg} kg ({grinder.wear_percentage}%)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold ${
                      grinder.status === 'GOOD'
                        ? 'text-emerald-500 border-emerald-500/30'
                        : grinder.status === 'INSPECTION_DUE'
                        ? 'text-amber-500 border-amber-500/30'
                        : 'text-rose-500 border-rose-500/30'
                    }`}
                  >
                    {grinder.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    grinder.status === 'GOOD'
                      ? 'bg-emerald-500'
                      : grinder.status === 'INSPECTION_DUE'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, grinder.wear_percentage)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Remaining rated burr lifespan: {grinder.remaining_capacity_kg} kg</span>
                <button
                  type="button"
                  onClick={handleResetBurrs}
                  className="flex items-center gap-1 hover:text-foreground transition-colors underline font-medium"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Burrs (Maintenance)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
