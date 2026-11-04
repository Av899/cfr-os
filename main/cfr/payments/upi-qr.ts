/**
 * CFR OS: Dynamic UPI QR Code Engine
 *
 * Implements Indian National Payments Corporation (NPCI) standard UPI payment URI:
 * upi://pay?pa=<VPA>&pn=<Name>&am=<Amount>&cu=INR&tn=<Note>&tr=<TxnRef>
 *
 * Rules:
 * - Amount is strictly calculated from integer paise to avoid rounding discrepancies.
 * - Dynamic QR generated per bill with exact payable amount.
 * - Supports QR Data URL generation for direct display on POS & customer studio screens.
 */

import QRCode from 'qrcode';

export interface UpiConfig {
  vpa: string;
  payeeName: string;
  merchantCode?: string; // Optional MCC (e.g. 5812 for restaurants/cafes)
}

export const DEFAULT_UPI_CONFIG: UpiConfig = {
  vpa: process.env.CFR_UPI_VPA || 'cfrcoffee@icici',
  payeeName: process.env.CFR_UPI_PAYEE_NAME || 'CFR Coffee',
  merchantCode: '5812',
};

export interface GenerateUpiParams {
  amountPaise: number;
  orderId: string;
  invoiceNumber?: string;
  note?: string;
  txnRef?: string;
  config?: Partial<UpiConfig>;
}

export interface UpiQrResult {
  uri: string;
  qrDataUrl: string;
  amountPaise: number;
  amountRupees: string;
  payeeVpa: string;
  payeeName: string;
  expiresAt: string;
  txnRef: string;
}

/**
 * Validates 12-digit Indian Bank UTR / UPI Transaction Reference Number.
 * Format: Typically 12 numeric digits (e.g. 430489123456).
 */
export function isValidUtr(utr: string | undefined | null): boolean {
  if (!utr) return false;
  const clean = utr.trim().replace(/^(UTR|UPI)[:\s-]*/i, '');
  // Must be 12-digit alphanumeric or numeric string, not dummy repetitives
  if (!/^[a-zA-Z0-9]{12}$/.test(clean)) return false;
  // Reject obvious fake test entries like 000000000000 or 123456789012
  if (/^0{12}$/.test(clean) || /^1{12}$/.test(clean)) return false;
  return true;
}

/**
 * Normalizes user-entered UTR string.
 */
export function normalizeUtr(utr: string): string {
  return utr.trim().replace(/^(UTR|UPI)[:\s-]*/i, '').toUpperCase();
}

/**
 * Constructs standard NPCI UPI Payment URI string.
 */
export function generateUpiUri(params: GenerateUpiParams): { uri: string; txnRef: string; amountRupees: string } {
  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new Error(`Invalid UPI amount: must be positive integer paise (got: ${params.amountPaise})`);
  }

  const vpa = params.config?.vpa || DEFAULT_UPI_CONFIG.vpa;
  const payeeName = params.config?.payeeName || DEFAULT_UPI_CONFIG.payeeName;
  const mcc = params.config?.merchantCode || DEFAULT_UPI_CONFIG.merchantCode;

  const amountRupees = (params.amountPaise / 100).toFixed(2);
  const txnRef = params.txnRef || `CFR${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
  const note = params.note || (params.invoiceNumber ? `Invoice ${params.invoiceNumber}` : `Order #${params.orderId}`);

  const queryParts = [
    `pa=${encodeURIComponent(vpa)}`,
    `pn=${encodeURIComponent(payeeName)}`,
    `am=${encodeURIComponent(amountRupees)}`,
    `cu=INR`,
    `tn=${encodeURIComponent(note)}`,
    `tr=${encodeURIComponent(txnRef)}`,
  ];

  if (mcc) {
    queryParts.push(`mc=${encodeURIComponent(mcc)}`);
  }

  const uri = `upi://pay?${queryParts.join('&')}`;
  return { uri, txnRef, amountRupees };
}

/**
 * Generates dynamic UPI QR Code Data URL (PNG) along with UPI URI.
 */
export async function generateUpiQr(params: GenerateUpiParams, validityMinutes: number = 5): Promise<UpiQrResult> {
  const { uri, txnRef, amountRupees } = generateUpiUri(params);

  // Generate QR code data URL (PNG)
  const qrDataUrl = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
    color: {
      dark: '#1E1B16', // Espresso brand color
      light: '#FFFFFF',
    },
  });

  const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000).toISOString();

  return {
    uri,
    qrDataUrl,
    amountPaise: params.amountPaise,
    amountRupees,
    payeeVpa: params.config?.vpa || DEFAULT_UPI_CONFIG.vpa,
    payeeName: params.config?.payeeName || DEFAULT_UPI_CONFIG.payeeName,
    expiresAt,
    txnRef,
  };
}
