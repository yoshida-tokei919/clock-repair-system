export class OrderExpectedArrivalError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function resolveExpectedArrivalDate(
  orderedAt: Date | null,
  manualProcessingLeadDays: number | null,
  manualTransitLeadDays: number | null,
): Date | null {
  if (!orderedAt || !Number.isFinite(orderedAt.getTime()) ||
      manualProcessingLeadDays === null || manualTransitLeadDays === null ||
      !Number.isSafeInteger(manualProcessingLeadDays) || manualProcessingLeadDays < 0 ||
      !Number.isSafeInteger(manualTransitLeadDays) || manualTransitLeadDays < 0) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(orderedAt);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const date = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  date.setUTCDate(date.getUTCDate() + manualProcessingLeadDays + manualTransitLeadDays);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function parseOrderUpdateInput(value: unknown): {
  status?: string;
  procurementShippingMethodId?: number | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new OrderExpectedArrivalError("入力形式が正しくありません。");
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => key !== "status" && key !== "procurementShippingMethodId"))
    throw new OrderExpectedArrivalError("入力項目が正しくありません。");
  if ("status" in input && (typeof input.status !== "string" || !input.status))
    throw new OrderExpectedArrivalError("ステータスが正しくありません。");
  if ("procurementShippingMethodId" in input) {
    const id = input.procurementShippingMethodId;
    if (id !== null && (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || id > 2147483647))
      throw new OrderExpectedArrivalError("調達配送方法IDが正しくありません。");
  }
  return input as { status?: string; procurementShippingMethodId?: number | null };
}

export function assertShippingMethodChangeAllowed(
  previousStatus: string,
  nextStatus: string,
  previousMethodId: number | null,
  nextMethodId: number | null,
  methodProvided: boolean,
  methodActive: boolean | null,
) {
  if (!methodProvided) return;
  if (!(["pending", "ordered"].includes(previousStatus) && ["pending", "ordered"].includes(nextStatus)))
    throw new OrderExpectedArrivalError("入荷済み・割当済みの発注では配送方法を変更できません。", 409);
  if (nextMethodId !== null && nextMethodId !== previousMethodId && !methodActive)
    throw new OrderExpectedArrivalError("無効な配送方法は新しく選択できません。", 409);
}

type OrderArrivalUpdateInput = {
  previousStatus: string;
  status: string;
  previousOrderedAt: Date | null;
  previousMethodId: number | null;
  methodId: number | null;
  methodProvided: boolean;
  processingDays: number | null;
  transitDays: number | null;
  now: Date;
};

export function shouldRecalculateOrderArrival(input: Pick<OrderArrivalUpdateInput,
  "previousStatus" | "status" | "previousOrderedAt" | "previousMethodId" | "methodId" | "methodProvided">): boolean {
  return input.status === "ordered" && (
    input.previousStatus !== "ordered" ||
    input.previousOrderedAt === null ||
    (input.methodProvided && input.methodId !== input.previousMethodId)
  );
}

export function getOrderArrivalUpdate(input: OrderArrivalUpdateInput) {
  const orderedAt = input.status === "ordered" ? input.previousOrderedAt ?? input.now : undefined;
  return {
    procurementShippingMethodId: input.methodId,
    expectedArrivalDate: shouldRecalculateOrderArrival(input)
      ? resolveExpectedArrivalDate(orderedAt!, input.processingDays, input.transitDays)
      : input.status === "pending" ? null : undefined,
    orderedAt,
  };
}
