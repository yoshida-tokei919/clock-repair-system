import { assertYen, calculateTaxableAmounts, sumCustomerLines, type PricingTaxMode } from "@/lib/pricing-tax";

export function customerPlanName(name: string, planIndex: number): string {
  const label = planIndex < 26 ? `${String.fromCharCode(65 + planIndex)}案` : `第${planIndex + 1}案`;
  const savedName = name.trim();
  if (!savedName || savedName === "共通見積のみ" || savedName === label.slice(0, -1)) return label;
  return savedName.startsWith(label) ? savedName : `${label}：${savedName}`;
}

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
