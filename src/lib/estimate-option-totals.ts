import { assertYen, calculateTaxableAmounts, sumCustomerLines, type PricingTaxMode } from "@/lib/pricing-tax";

export function selectedOptionTotal(
  commonLines: readonly { unitPrice: number; quantity: number }[],
  plan: { lines: readonly { unitPrice: number; quantity: number }[] } | null,
  addOns: readonly { lines: readonly { unitPrice: number; quantity: number }[] }[],
  mode: PricingTaxMode,
) {
  const commonAmount = sumCustomerLines(commonLines);
  const planAmount = plan ? sumCustomerLines(plan.lines) : 0;
  const addOnAmount = addOns.reduce((sum, addOn) => assertYen(sum + sumCustomerLines(addOn.lines)), 0);
  return { commonAmount, planAmount, addOnAmount,
    ...calculateTaxableAmounts(assertYen(commonAmount + planAmount + addOnAmount), mode) };
}
