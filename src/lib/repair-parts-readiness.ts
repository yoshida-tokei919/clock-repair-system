type EstimatePart = { type: string; partsMasterId: number | null; quantity: number | null };
type Allocation = { partsMasterId: number; quantity: number | null; state: string };
type Order = {
  repairId: number | null;
  partsMasterId: number | null;
  quantity: number | null;
  status: string;
  expectedArrivalDate: Date | string | null;
  receivedAt: Date | string | null;
};

export type PartsReadiness = {
  state: "LEGACY_UNKNOWN" | "NOT_REQUIRED" | "READY" | "WAITING" | "WAITING_UNKNOWN";
  isReady: boolean | null;
  partsReadyDate: string | null;
  requiredPartCount: number;
  shortagePartCount: number;
  requiredQuantity: number;
  allocatedQuantity: number;
};

function tokyoDate(value: Date | string | null): string | null {
  if (!value) return null;
  // PostgreSQL @db.Date is a calendar date represented by Prisma at UTC midnight.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function resolveRepairPartsReadiness(input: {
  repairId: number;
  partsAllocationLegacy: boolean;
  estimateItems: EstimatePart[];
  allocations: Allocation[];
  orders: Order[];
}): PartsReadiness {
  const required = new Map<number, number>();
  for (const item of input.estimateItems) {
    if (item.type !== "part" || item.partsMasterId === null) continue;
    required.set(item.partsMasterId, (required.get(item.partsMasterId) ?? 0) + Math.max(0, item.quantity ?? 1));
  }
  const base = {
    partsReadyDate: null,
    requiredPartCount: required.size,
    shortagePartCount: 0,
    requiredQuantity: Array.from(required.values()).reduce((sum, quantity) => sum + quantity, 0),
    allocatedQuantity: 0,
  };
  if (input.partsAllocationLegacy) return { ...base, state: "LEGACY_UNKNOWN", isReady: null };
  if (base.requiredQuantity === 0) return { ...base, state: "NOT_REQUIRED", isReady: true };

  const allocated = new Map<number, number>();
  for (const row of input.allocations) {
    if (row.state !== "RESERVED" && row.state !== "CONSUMED") continue;
    allocated.set(row.partsMasterId, (allocated.get(row.partsMasterId) ?? 0) + Math.max(0, row.quantity ?? 0));
  }
  const shortageDates: string[] = [];
  let shortagePartCount = 0;
  let forecastKnown = true;
  let allocatedQuantity = 0;
  for (const [partId, quantity] of Array.from(required.entries())) {
    const reserved = Math.min(quantity, allocated.get(partId) ?? 0);
    allocatedQuantity += reserved;
    const shortage = quantity - reserved;
    if (shortage === 0) continue;
    shortagePartCount++;
    const supplies = input.orders
      .filter(order => order.repairId === input.repairId && order.partsMasterId === partId &&
        (order.status === "ordered" || order.status === "received"))
      .map(order => ({
        quantity: Math.max(0, order.quantity ?? 0),
        date: order.status === "ordered" ? tokyoDate(order.expectedArrivalDate) : tokyoDate(order.receivedAt),
      }))
      .filter((supply): supply is { quantity: number; date: string } => supply.date !== null && supply.quantity > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    let incoming = 0;
    const coverage = supplies.find(supply => (incoming += supply.quantity) >= shortage);
    if (coverage) shortageDates.push(coverage.date);
    else forecastKnown = false;
  }
  if (shortagePartCount === 0) return { ...base, allocatedQuantity, state: "READY", isReady: true };
  return {
    ...base, allocatedQuantity, shortagePartCount,
    state: forecastKnown ? "WAITING" : "WAITING_UNKNOWN",
    isReady: false,
    partsReadyDate: forecastKnown ? shortageDates.sort().at(-1)! : null,
  };
}
