export type PricingTaxMode = "EXCLUSIVE" | "INCLUSIVE";

export function effectivePricingTaxMode(customer: { type: string; pricingTaxMode?: string | null }): PricingTaxMode {
  return customer.type === "business" && customer.pricingTaxMode === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
}

export function assertYen(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) {
    throw new Error("金額は0以上の整数円で入力してください");
  }
  return value;
}

export function multiplyYen(unitPrice: number, quantity: number): number {
  assertYen(unitPrice);
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("数量は1以上の整数で入力してください");
  return assertYen(Number(BigInt(unitPrice) * BigInt(quantity)));
}

export function partCustomerUnitPrice(basePrice: number, mode: PricingTaxMode): number {
  assertYen(basePrice);
  return mode === "INCLUSIVE" ? assertYen(Number(BigInt(basePrice) * BigInt(110) / BigInt(100))) : basePrice;
}

// PricingRule labor prices are already customer final amounts in inclusive mode.
export function laborCustomerUnitPrice(rulePrice: number): number {
  return assertYen(rulePrice);
}

export function calculateTaxableAmounts(lineSum: number, mode: PricingTaxMode) {
  assertYen(lineSum);
  const taxAmount = Number(BigInt(lineSum) * BigInt(10) / BigInt(mode === "INCLUSIVE" ? 110 : 100));
  const totalAmount = mode === "INCLUSIVE" ? lineSum - taxAmount : lineSum;
  const grossAmount = mode === "INCLUSIVE" ? lineSum : assertYen(lineSum + taxAmount);
  return { totalAmount, taxAmount, grossAmount };
}

export function sumCustomerLines(items: readonly { unitPrice: number; quantity: number }[]): number {
  return items.reduce((sum, item) => assertYen(sum + multiplyYen(item.unitPrice, item.quantity)), 0);
}

export function commonEstimateMode(repairs: readonly { estimate: { pricingTaxMode: string } | null }[]): PricingTaxMode {
  const modes = new Set(repairs.map(repair => repair.estimate?.pricingTaxMode ?? "EXCLUSIVE"));
  if (modes.size !== 1 || [...modes].some(mode => mode !== "EXCLUSIVE" && mode !== "INCLUSIVE")) {
    throw new Error("税表示方式が異なる見積は同じ帳票にまとめられません");
  }
  return [...modes][0] as PricingTaxMode;
}

export function repairPartBasePrice(item: { basePrice?: unknown; price: number; partsMasterId?: unknown }, mode: PricingTaxMode, existingMasterPrice?: number): number {
  if (mode === "EXCLUSIVE") return assertYen(item.price);
  if (existingMasterPrice !== undefined) return assertYen(existingMasterPrice);
  if (typeof item.basePrice !== "number") throw new Error("新規部品の税抜上代が必要です。部品価格を再入力してください");
  const base = assertYen(item.basePrice);
  if (partCustomerUnitPrice(base, mode) !== item.price) throw new Error("部品の税抜上代と税込表示額が一致しません");
  return base;
}
