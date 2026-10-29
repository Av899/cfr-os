/**
 * CFR OS: Indian GST Thermal Receipt Template
 *
 * Formats ESC/POS compatible receipts for 80mm (48 characters/line)
 * and 58mm (32 characters/line) thermal printers matching Indian GST statutory rules.
 */

import { formatRupees, GstBreakdown } from '../money/gst-engine';
import { CfrInvoiceRecord } from '../invoicing/sequence';

export interface ReceiptItem {
  name: string;
  quantity: number;
  rate_paise: number;
  amount_paise: number;
}

export interface ReceiptConfig {
  brandName?: string;
  tagline?: string;
  address?: string;
  fssaiNumber?: string;
  gstin?: string;
  phone?: string;
  widthChars?: number; // 48 for 80mm, 32 for 58mm
}

const DEFAULT_CONFIG: Required<ReceiptConfig> = {
  brandName: 'COFFEE FIRST RITUAL',
  tagline: 'Good Coffee. Better Days.',
  address: 'SCO 42, Sector 12, Karnal, Haryana - 132001',
  fssaiNumber: '10826999000123',
  gstin: '06AABCC1234D1Z5',
  phone: '+91 98120 00000',
  widthChars: 48,
};

function center(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function divider(char: string = '-', width: number = 48): string {
  return char.repeat(width);
}

function justify(left: string, right: string, width: number): string {
  const space = width - left.length - right.length;
  if (space <= 0) return `${left} ${right}`;
  return left + ' '.repeat(space) + right;
}

/**
 * Generates an Indian GST statutory thermal receipt text string.
 */
export function generateThermalReceiptText(
  invoice: CfrInvoiceRecord,
  gst: GstBreakdown,
  items: ReceiptItem[],
  customConfig?: ReceiptConfig
): string {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  const w = config.widthChars;
  const lines: string[] = [];

  // 1. Header
  lines.push(center(config.brandName, w));
  lines.push(center(config.tagline, w));
  lines.push(center(config.address, w));
  lines.push(center(`GSTIN: ${config.gstin}`, w));
  lines.push(center(`FSSAI Lic: ${config.fssaiNumber}`, w));
  lines.push(divider('=', w));

  // 2. Invoice Meta
  lines.push(center('TAX INVOICE', w));
  lines.push(justify(`Invoice: ${invoice.invoice_number}`, `FY: ${invoice.fy}`, w));
  lines.push(justify(`Date: ${new Date(invoice.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, `SAC: ${gst.sac_code}`, w));
  lines.push(justify(`Payment: ${invoice.payment_method}`, invoice.payment_ref ? `Ref: ${invoice.payment_ref}` : '', w));
  lines.push(divider('-', w));

  // 3. Item Table Header
  lines.push(justify('Item Description', 'Qty x Rate     Amount', w));
  lines.push(divider('-', w));

  // 4. Line Items
  for (const item of items) {
    const rateFormatted = (item.rate_paise / 100).toFixed(2);
    const amtFormatted = (item.amount_paise / 100).toFixed(2);
    const rightCol = `${item.quantity} x ${rateFormatted}   ${amtFormatted}`;
    lines.push(justify(item.name, rightCol, w));
  }
  lines.push(divider('-', w));

  // 5. GST Breakdown & Totals
  lines.push(justify('Taxable Subtotal:', formatRupees(gst.taxable_paise), w));
  lines.push(justify(`CGST @ ${gst.cgst_rate}%:`, formatRupees(gst.cgst_paise), w));
  lines.push(justify(`SGST @ ${gst.sgst_rate}%:`, formatRupees(gst.sgst_paise), w));
  lines.push(justify('Total GST (5%):', formatRupees(gst.total_tax_paise), w));

  if (gst.round_off_paise !== 0) {
    const sign = gst.round_off_paise > 0 ? '+' : '';
    lines.push(justify('Round-off:', `${sign}${formatRupees(gst.round_off_paise)}`, w));
  }

  lines.push(divider('=', w));
  lines.push(justify('TOTAL PAYABLE (INR):', formatRupees(gst.payable_paise), w));
  lines.push(divider('=', w));

  // 6. Mandatory CFR Footer
  lines.push('');
  lines.push(center('100% ARTISANAL EGGLESS & PURE VEGETARIAN', w));
  lines.push(center('Thank you for sharing your coffee ritual with us.', w));
  lines.push(center('www.cfrcoffee.com', w));
  lines.push('');

  return lines.join('\n');
}
