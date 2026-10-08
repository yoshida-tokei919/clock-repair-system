import type { PaymentStatus } from "@prisma/client";

export const PREPAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "お支払い待ち",
  SUCCEEDED: "入金済み",
  FAILED: "決済失敗",
  CANCELED: "取消済み",
};

export function summarizeRepairPrepayments(payments: readonly { amount: number; status: PaymentStatus }[]) {
  return payments.reduce(
    (summary, payment) => {
      if (payment.status === "SUCCEEDED") summary.succeededTotal += payment.amount;
      if (payment.status === "PENDING") summary.pendingAmount += payment.amount;
      return summary;
    },
    { succeededTotal: 0, pendingAmount: 0 },
  );
}
