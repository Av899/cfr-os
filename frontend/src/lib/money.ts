import type { CurrencyUnitAdapter } from '@/lib/countries';

/**
 * Single home for display-amount → integer-cents conversion (issue #279).
 * The adapter's `toStored` returns MAJOR units (Rial for IRR/Toman — the
 * adapter folds the Toman-to-Rial ratio itself), so multiplying by the
 * storage minor factor gives integer cents. Empty/invalid/negative →
 * null so callers can gate submit instead of sending a misleading 0.
 * Consumed by useCashClose (day close) and useCashSession (shifts) —
 * money conversion must not drift between the two flows.
 */
export function displayAmountToCents(
  raw: string,
  unitAdapter: Pick<CurrencyUnitAdapter, 'toStored'>,
  minorFactor: number,
): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(unitAdapter.toStored(n) * minorFactor);
}

/**
 * Divides an integer minor-unit total into `count` equal shares without
 * creating or dropping a minor unit: the first `remainder` shares carry one
 * extra unit, so 100.00 over 3 is 33.34 + 33.33 + 33.33 and 100 JPY over 3 is
 * 34 + 33 + 33. The caller owns precision, passing minor units for the
 * tenant's stored currency.
 */
export function allocateEqualShares(totalMinor: number, count: number): number[] {
  const quotient = Math.floor(totalMinor / count);
  const remainder = totalMinor % count;
  return Array.from({ length: count }, (_, index) => (index < remainder ? quotient + 1 : quotient));
}

/**
 * CFR OS: formats integer paise to Indian Rupee string with symbol.
 * Example: rupees(48300, 2) -> "₹483.00"
 */
export const rupees = (paise: number, digits = 0) =>
  '₹' +
  new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(paise / 100);

/**
 * CFR OS: Calculates 5% Haryana GST (2.5% CGST + 2.5% SGST) + Roundoff to nearest whole rupee.
 * Matches backend gst-engine.ts exactly.
 */
export function gst(subtotalPaise: number) {
  const cgst = Math.round((subtotalPaise * 25) / 1000); // 2.5%
  const sgst = cgst;
  const rawTotal = subtotalPaise + cgst + sgst;
  const payable = Math.round(rawTotal / 100) * 100;
  const roundOff = payable - rawTotal;
  return {
    cgst,
    sgst,
    totalTax: cgst + sgst,
    rawTotal,
    roundOff,
    payable,
  };
}
