import { calculateTaxableAmounts, assertYen, type PricingTaxMode } from "./pricing-tax";

export const DEFAULT_B2B_INVOICE_DISCOUNT_BPS = 300;

export function parseDiscountBps(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 10000) {
    throw new Error("請求割引率は0〜100%の0.01%単位で指定してください");
  }
  return value as number;
}

export function percentInputToBps(value: string): number | "" {
  if (value === "") return "";
  if (!/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(value)) return Number.NaN;
  const [whole, decimal = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}

export function resolveDiscountBps(invoiceOverride: number | null | undefined,
  customerOverride: number | null | undefined, standard: number) {
  return parseDiscountBps(invoiceOverride ?? customerOverride ?? standard);
}

export function invoiceAmountsWithDiscount(lineSum: number, shippingFee: number,
  mode: PricingTaxMode, rateBps: number) {
  assertYen(lineSum);
  assertYen(shippingFee);
  parseDiscountBps(rateBps);
  const original = calculateTaxableAmounts(lineSum, mode);
  const discountBasisAmount = original.totalAmount;
  const discountAmount = Number(BigInt(discountBasisAmount) * BigInt(rateBps) / BigInt(10000));
  const totalAmount = discountBasisAmount - discountAmount;
  // A zero discount must preserve the existing inclusive tax split exactly.
  const taxAmount = discountAmount === 0 ? original.taxAmount : Number(BigInt(totalAmount) / BigInt(10));
  return { discountBasisAmount, discountRateBps: rateBps, discountAmount,
    totalAmount, taxAmount, shippingFeeAmount: shippingFee,
    grossTotalAmount: assertYen(totalAmount + taxAmount + shippingFee) };
}

export function hasDiscountSnapshot(row: {
  discountBasisAmount?: number | null; discountRateBps?: number | null; discountAmount?: number | null;
  totalAmount: number;
}) {
  const { discountBasisAmount: basis, discountRateBps: rate, discountAmount: amount } = row;
  if (basis == null && rate == null && amount == null) return true;
  if (basis == null || rate == null || amount == null) return false;
  try {
    assertYen(basis); assertYen(amount); parseDiscountBps(rate);
    return amount === Number(BigInt(basis) * BigInt(rate) / BigInt(10000)) &&
      row.totalAmount === basis - amount;
  } catch { return false; }
}
