/**
 * CFR OS: Indian GST Engine & ₹10 Price Increment Guard
 *
 * Rules:
 * - Integer paise throughout (1 INR = 100 paise). Zero floating-point decimals.
 * - Sellable item prices must be in ₹10 increments, exclusive of 5% GST (pricePaise % 1000 === 0).
 * - Intra-state Haryana GST (SAC Code 996331): 2.5% CGST + 2.5% SGST.
 * - Computed at invoice level on taxable subtotal after discounts.
 * - Round-off line to the nearest whole rupee (100 paise).
 *
 * Golden Fixture:
 *   ₹230 (23,000 paise) + ₹220 (22,000 paise) = ₹450.00 taxable (45,000 paise)
 *   CGST 2.5%: ₹11.25 (1,125 paise)
 *   SGST 2.5%: ₹11.25 (1,125 paise)
 *   Raw Total: ₹472.50 (47,250 paise)
 *   Round-off: +₹0.50 (+50 paise)
 *   Net Payable: ₹473.00 (47,300 paise)
 */

export const SAC_CODE_RESTAURANT = '996331';
export const GST_RATE_PERCENT = 5.0;
export const CGST_RATE_PERCENT = 2.5;
export const SGST_RATE_PERCENT = 2.5;

export class InvalidPriceIncrementError extends Error {
  public readonly code = 'ERR_CFR_INVALID_PRICE_INCREMENT';
  public readonly statusCode = 400;
  public readonly pricePaise: number;

  constructor(pricePaise: number, itemName?: string) {
    const formatted = (pricePaise / 100).toFixed(2);
    super(
      `Price validation failed: ${itemName ? `Item "${itemName}"` : 'Price'} ₹${formatted} is not a valid ₹10 increment. All CFR menu prices must be multiples of ₹10.`
    );
    this.name = 'InvalidPriceIncrementError';
    this.pricePaise = pricePaise;
  }
}

/**
 * Validates that an item price in paise is in ₹10 increments (e.g. ₹230, ₹240, ₹250).
 */
export function validatePriceIncrement(pricePaise: number, itemName?: string): void {
  if (!Number.isInteger(pricePaise) || pricePaise <= 0 || pricePaise % 1000 !== 0) {
    throw new InvalidPriceIncrementError(pricePaise, itemName);
  }
}

export interface GstBreakdown {
  taxable_paise: number;
  cgst_rate: number;
  sgst_rate: number;
  cgst_paise: number;
  sgst_paise: number;
  total_tax_paise: number;
  raw_total_paise: number;
  round_off_paise: number;
  payable_paise: number;
  sac_code: string;
}

/**
 * Computes Haryana intra-state restaurant GST (5%) with exact half-up rounding
 * and invoice-level round-off to the nearest rupee.
 */
export function calculateHaryanaGst(taxablePaise: number): GstBreakdown {
  if (!Number.isInteger(taxablePaise) || taxablePaise < 0) {
    throw new Error(`Taxable amount must be a non-negative integer paise value (got: ${taxablePaise})`);
  }

  // 2.5% CGST = (taxablePaise * 25) / 1000
  // Half-up rounding
  const cgst_paise = Math.round((taxablePaise * 25) / 1000);
  const sgst_paise = cgst_paise; // CGST and SGST are always identical for intra-state GST
  const total_tax_paise = cgst_paise + sgst_paise;

  const raw_total_paise = taxablePaise + total_tax_paise;

  // Round to nearest whole ₹1 (100 paise)
  const payable_paise = Math.round(raw_total_paise / 100) * 100;
  const round_off_paise = payable_paise - raw_total_paise;

  return {
    taxable_paise: taxablePaise,
    cgst_rate: CGST_RATE_PERCENT,
    sgst_rate: SGST_RATE_PERCENT,
    cgst_paise,
    sgst_paise,
    total_tax_paise,
    raw_total_paise,
    round_off_paise,
    payable_paise,
    sac_code: SAC_CODE_RESTAURANT,
  };
}

/**
 * Formats paise as INR string with ₹ symbol and 2 decimals (e.g. ₹473.00).
 */
export function formatRupees(paise: number): string {
  const isNegative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = (abs / 100).toFixed(2);
  return `${isNegative ? '-' : ''}₹${rupees}`;
}
