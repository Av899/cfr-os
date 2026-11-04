'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  QrCode,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CfrLogo } from '@/components/ui/CfrLogo';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export interface UpiPaymentResult {
  method: string;
  transaction_id: string;
  amount: number;
  payment_id?: string;
}

export interface UpiPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | number;
  billId: string | number;
  billNumber?: string;
  amountPaise: number;
  onPaymentConfirmed: (result: UpiPaymentResult) => void;
}

export function UpiPaymentModal({
  isOpen,
  onClose,
  orderId,
  billId,
  billNumber,
  amountPaise,
  onPaymentConfirmed,
}: UpiPaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [upiUri, setUpiUri] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [isExpired, setIsExpired] = useState(false);

  // Manual UTR drawer state
  const [showManualUtr, setShowManualUtr] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [utrError, setUtrError] = useState<string | null>(null);
  const [submittingUtr, setSubmittingUtr] = useState(false);

  // Status check & polling
  const [paymentStatus, setPaymentStatus] = useState<'PENDING_RECONCILIATION' | 'CONFIRMED' | 'FAILED'>('PENDING_RECONCILIATION');
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const amountRupees = (amountPaise / 100).toFixed(2);

  /**
   * Generates or refreshes the Dynamic UPI QR code.
   */
  const fetchQr = useCallback(async () => {
    if (!orderId || amountPaise <= 0) return;
    setLoading(true);
    setError(null);
    setIsExpired(false);
    setUtrError(null);
    setPaymentStatus('PENDING_RECONCILIATION');

    try {
      const res = await api.post('/cfr/payments/upi-qr', {
        order_id: String(orderId),
        amount_paise: amountPaise,
        invoice_number: billNumber || `ORD-${orderId}`,
        note: `CFR Coffee Karnal - Bill ${billNumber || orderId}`,
      });

      const data = res.data;
      setQrDataUrl(data.qr_data_url);
      setUpiUri(data.uri);
      setPaymentId(data.payment_id);
      setExpiresAt(data.expires_at);

      if (data.expires_at) {
        const diffSecs = Math.max(0, Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000));
        setSecondsRemaining(diffSecs > 0 ? diffSecs : 300);
      } else {
        setSecondsRemaining(300);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to generate dynamic UPI QR';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [orderId, amountPaise, billNumber]);

  // Initial load when opened
  useEffect(() => {
    if (isOpen) {
      setUtrInput('');
      setShowManualUtr(false);
      fetchQr();
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }
  }, [isOpen, fetchQr]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !expiresAt || isExpired) return;

    countdownTimerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isOpen, expiresAt, isExpired]);

  // Status Polling: Checks payment confirmation every 3 seconds
  useEffect(() => {
    if (!isOpen || !paymentId || paymentStatus === 'CONFIRMED' || isExpired) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/cfr/payments/${paymentId}`);
        const p = res.data?.payment;
        if (p && p.status === 'CONFIRMED') {
          setPaymentStatus('CONFIRMED');
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          toast.success('UPI Payment confirmed by bank!');
          setTimeout(() => {
            onPaymentConfirmed({
              method: 'UPI',
              transaction_id: p.utr_ref || p.gateway_payment_id || `UPI-${paymentId}`,
              amount: amountPaise / 100,
              payment_id: p.id,
            });
          }, 800);
        }
      } catch {
        // Silent poll error; manual UTR fallback is available if WAN fails
      }
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, paymentId, paymentStatus, isExpired, amountPaise, onPaymentConfirmed]);

  /**
   * Manual UTR confirmation (cashier enters 12-digit UTR shown on customer's phone).
   */
  const handleManualUtrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUtr = utrInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (cleanUtr.length !== 12) {
      setUtrError('UTR must be exactly 12 alphanumeric digits.');
      return;
    }

    setSubmittingUtr(true);
    setUtrError(null);

    try {
      const res = await api.post('/cfr/payments/reconcile-manual', {
        payment_id: paymentId || undefined,
        order_id: String(orderId),
        utr: cleanUtr,
      });

      const payment = res.data?.payment;
      setPaymentStatus('CONFIRMED');
      toast.success(`Payment verified with UTR ${cleanUtr}`);

      setTimeout(() => {
        onPaymentConfirmed({
          method: 'UPI',
          transaction_id: cleanUtr,
          amount: amountPaise / 100,
          payment_id: payment?.id || paymentId || undefined,
        });
      }, 500);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to verify UTR.';
      setUtrError(msg);
      toast.error(msg);
    } finally {
      setSubmittingUtr(false);
    }
  };

  /**
   * Developer / Simulation trigger to confirm payment without external bank gateway.
   */
  const handleSimulateConfirmation = async () => {
    if (!paymentId) return;
    try {
      const simGatewayId = `sim_upi_${Date.now()}`;
      await api.post('/cfr/payments/webhook', {
        payment_id: paymentId,
        gateway_payment_id: simGatewayId,
        status: 'CONFIRMED',
      });
      setPaymentStatus('CONFIRMED');
      toast.success('Simulated bank confirmation received.');
      setTimeout(() => {
        onPaymentConfirmed({
          method: 'UPI',
          transaction_id: simGatewayId,
          amount: amountPaise / 100,
          payment_id: paymentId,
        });
      }, 600);
    } catch (err: any) {
      toast.error(err?.message || 'Simulation failed');
    }
  };

  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isTimerLow = secondsRemaining <= 60 && secondsRemaining > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cfr-upi-title"
    >
      <div className="relative w-full max-w-md bg-[#FAF7F2] dark:bg-[#1E1B16] text-[#1E1B16] dark:text-[#F6F4ED] rounded-3xl shadow-2xl border border-[#DCDAD3] dark:border-[#3A332B] overflow-hidden flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E9E7E0] dark:border-[#2E2822]">
          <div className="flex items-center gap-3">
            <CfrLogo variant="mark" className="w-7 h-7" color="#8B5E3C" />
            <div>
              <p className="text-[10px] tracking-widest uppercase font-semibold text-[#8B5E3C] dark:text-[#C9A782]">
                COFFEE FIRST RITUAL • SECTOR 12
              </p>
              <h2 id="cfr-upi-title" className="text-base font-bold text-[#1E1B16] dark:text-[#F6F4ED]">
                Dynamic UPI Payment
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#EFE8DD] dark:bg-[#2E2822] text-[#6F4A2F] dark:text-[#C9A782] hover:opacity-80 transition-opacity"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Amount Badge */}
          <div className="text-center bg-[#EFE8DD] dark:bg-[#2A231C] rounded-2xl py-3 px-4 border border-[#DCDAD3]/60 dark:border-[#3E342B]">
            <p className="text-xs uppercase tracking-wider font-medium text-[#6F4A2F] dark:text-[#C9A782]">
              {billNumber ? `Bill #${billNumber}` : `Order #${orderId}`} • Total Payable
            </p>
            <p className="text-4xl font-extrabold tracking-tight mt-1 text-[#1E1B16] dark:text-[#F6F4ED]">
              ₹{amountRupees}
            </p>
            <p className="text-[11px] text-[#6F4A2F] dark:text-[#C9A782] mt-0.5">
              Includes Haryana 5% GST (2.5% CGST + 2.5% SGST)
            </p>
          </div>

          {/* QR Code Presentation Box */}
          <div className="relative flex flex-col items-center justify-center p-6 bg-white dark:bg-[#15120E] rounded-2xl border-2 border-dashed border-[#C9A782] dark:border-[#524436]">
            {loading ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <RefreshCw size={36} className="animate-spin text-[#8B5E3C]" />
                <p className="text-xs font-medium text-[#6F4A2F]">Generating secure dynamic UPI QR...</p>
              </div>
            ) : error ? (
              <div className="py-12 flex flex-col items-center text-center gap-3">
                <AlertCircle size={36} className="text-red-500" />
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
                <Button size="sm" variant="outline" onClick={fetchQr} className="mt-2">
                  <RefreshCw size={14} className="mr-1.5" /> Retry
                </Button>
              </div>
            ) : qrDataUrl ? (
              <>
                <div className="relative p-2 bg-white rounded-xl shadow-sm border border-slate-200">
                  <img
                    src={qrDataUrl}
                    alt="CFR Dynamic UPI QR Code"
                    className="w-56 h-56 object-contain rounded-lg"
                  />
                  {/* Expired Overlay */}
                  {isExpired && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-xl p-4 text-center">
                      <Clock size={32} className="text-[#8A5A12] mb-2" />
                      <p className="text-sm font-bold text-[#1E1B16]">QR Code Expired</p>
                      <p className="text-xs text-muted-foreground mt-1 mb-3">
                        UPI QR codes expire after 5 minutes for security.
                      </p>
                      <Button size="sm" onClick={fetchQr} className="bg-[#8B5E3C] hover:bg-[#6F4A2F] text-white">
                        <RefreshCw size={14} className="mr-1.5" /> Refresh QR
                      </Button>
                    </div>
                  )}

                  {/* Confirmed Overlay */}
                  {paymentStatus === 'CONFIRMED' && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-xl p-4 text-center">
                      <CheckCircle2 size={44} className="text-emerald-600 mb-2 animate-bounce" />
                      <p className="text-base font-bold text-emerald-800">Payment Confirmed</p>
                      <p className="text-xs text-emerald-600 mt-1">Completing check...</p>
                    </div>
                  )}
                </div>

                {/* Timer & Payee Details */}
                <div className="mt-4 flex items-center justify-between w-full px-2 text-xs">
                  <span className="text-[#6F4A2F] dark:text-[#C9A782] font-medium">
                    VPA: <strong className="text-[#1E1B16] dark:text-[#F6F4ED]">cfrcoffee@icici</strong>
                  </span>
                  <div
                    className={`flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full ${
                      isExpired
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                        : isTimerLow
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    <Clock size={12} />
                    <span>{isExpired ? 'Expired' : timerText}</span>
                  </div>
                </div>

                <p className="text-[11px] text-[#6F4A2F] dark:text-[#C9A782] mt-2 text-center">
                  Scan with Google Pay, PhonePe, Paytm, BHIM, or any UPI app
                </p>
              </>
            ) : null}
          </div>

          {/* Fallback Drawer: Offline / Manual UTR Entry */}
          <div className="border border-[#DCDAD3] dark:border-[#3A332B] rounded-2xl overflow-hidden bg-white/60 dark:bg-[#181410]/60">
            <button
              type="button"
              onClick={() => setShowManualUtr((prev) => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between text-start hover:bg-[#EFE8DD]/50 dark:hover:bg-[#28211A] transition-colors"
            >
              <div className="flex items-center gap-2">
                <WifiOff size={15} className="text-[#8B5E3C] dark:text-[#C9A782]" />
                <span className="text-xs font-semibold text-[#1E1B16] dark:text-[#F6F4ED]">
                  Offline / Manual UTR Entry
                </span>
                <span className="text-[10px] bg-[#EFE8DD] dark:bg-[#2E2822] text-[#8B5E3C] dark:text-[#C9A782] px-2 py-0.5 rounded-full font-medium">
                  WAN Fallback
                </span>
              </div>
              {showManualUtr ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showManualUtr && (
              <form onSubmit={handleManualUtrSubmit} className="p-4 border-t border-[#DCDAD3] dark:border-[#3A332B] space-y-3 bg-[#FAF7F2] dark:bg-[#1E1B16]">
                <p className="text-[11px] text-[#6F4A2F] dark:text-[#C9A782] leading-relaxed">
                  If bank webhook is delayed or internet connection drops, enter the <strong>12-digit UTR / UPI Reference Number</strong> from the customer&apos;s phone receipt.
                </p>
                <div>
                  <input
                    type="text"
                    value={utrInput}
                    onChange={(e) => {
                      setUtrInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
                      setUtrError(null);
                    }}
                    placeholder="e.g. 430489123456"
                    maxLength={12}
                    className="w-full px-3 py-2 text-sm font-mono tracking-widest uppercase border border-[#C9A782] dark:border-[#524436] rounded-xl outline-none focus:ring-2 focus:ring-[#8B5E3C] bg-white dark:bg-[#120F0D]"
                    disabled={submittingUtr || paymentStatus === 'CONFIRMED'}
                    autoComplete="off"
                  />
                  {utrError && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{utrError}</p>}
                </div>
                <Button
                  type="submit"
                  disabled={submittingUtr || utrInput.trim().length !== 12 || paymentStatus === 'CONFIRMED'}
                  className="w-full bg-[#8B5E3C] hover:bg-[#6F4A2F] text-white text-xs font-semibold"
                >
                  {submittingUtr ? (
                    <>
                      <RefreshCw size={14} className="mr-1.5 animate-spin" /> Verifying UTR...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} className="mr-1.5" /> Reconcile & Complete (12-digit UTR)
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#EFE8DD] dark:bg-[#251E17] border-t border-[#DCDAD3] dark:border-[#3A332B] flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-[#6F4A2F] dark:text-[#C9A782]">
            Cancel
          </Button>

          {/* Test / Dev Sim trigger */}
          <button
            type="button"
            onClick={handleSimulateConfirmation}
            className="text-[11px] text-[#8B5E3C] dark:text-[#C9A782] hover:underline flex items-center gap-1 font-medium"
            title="Simulate successful bank webhook response"
          >
            <Sparkles size={12} />
            <span>Simulate Bank Success</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpiPaymentModal;

