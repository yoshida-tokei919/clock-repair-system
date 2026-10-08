function assertIntegerYen(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new Error("金額はDBに保存可能な非負の整数円で指定してください");
  }
  return value;
}

export type RefundAmount = { amount: number; status: string };
export type AllocationAmount = { allocatedAmount: number; releases?: { amount: number }[] };

export function refundTotals(refunds: RefundAmount[]) {
  let succeeded = 0;
  let pending = 0;
  for (const refund of refunds) {
    if (refund.status === "SUCCEEDED") succeeded += assertIntegerYen(refund.amount);
    if (refund.status === "PENDING") pending += assertIntegerYen(refund.amount);
  }
  return { succeeded: assertIntegerYen(succeeded), pending: assertIntegerYen(pending) };
}

export function effectiveAllocation(allocation: AllocationAmount) {
  const original = assertIntegerYen(allocation.allocatedAmount);
  const released = (allocation.releases ?? []).reduce((sum, row) => sum + assertIntegerYen(row.amount), 0);
  if (released > original) throw new Error("配賦の解除額が元の配賦額を超えています");
  return original - released;
}

export function refundableAmount(payment: {
  amount: number; kind: string; status: string;
  allocations: AllocationAmount[]; refunds: RefundAmount[];
}) {
  if (payment.status !== "SUCCEEDED") return 0;
  const { succeeded, pending } = refundTotals(payment.refunds);
  const applied = payment.kind === "REPAIR_PREPAYMENT"
    ? payment.allocations.reduce((sum, row) => sum + effectiveAllocation(row), 0) : 0;
  const available = assertIntegerYen(payment.amount) - applied - succeeded - pending;
  if (available < 0) throw new Error("返金可能額の台帳が不整合です");
  return available;
}
