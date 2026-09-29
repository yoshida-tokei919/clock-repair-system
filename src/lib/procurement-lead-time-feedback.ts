import type { PrismaClient } from "@prisma/client";
import { resolveExpectedArrivalDate, tokyoCalendarDate } from "./order-expected-arrival";

type OrderActual = {
  supplierId: number | null;
  procurementShippingMethodId: number | null;
  orderedAt: Date | null;
  receivedAt: Date | null;
  status: string;
};
type SupplierSetting = { id: number; name: string; manualProcessingLeadDays: number | null };
type ShippingSetting = { id: number; name: string; manualTransitLeadDays: number | null };

export type ProcurementLeadTimeFeedbackRow = {
  supplierId: number | null;
  supplierName: string | null;
  shippingMethodId: number | null;
  shippingMethodName: string | null;
  sampleCount: number;
  configuredTotalDays: number | null;
  medianDays: number;
  meanDays: number;
  p80Days: number;
  minDays: number;
  maxDays: number;
  medianDeltaDays: number | null;
  meanDeltaDays: number | null;
  p80DeltaDays: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeProcurementLeadTimes(
  orders: readonly OrderActual[], suppliers: readonly SupplierSetting[], methods: readonly ShippingSetting[],
): ProcurementLeadTimeFeedbackRow[] {
  const supplierById = new Map(suppliers.map(row => [row.id, row]));
  const methodById = new Map(methods.map(row => [row.id, row]));
  const groups = new Map<string, { orderDate: Date; days: number[]; supplierId: number | null; methodId: number | null }>();

  for (const order of orders) {
    if (order.status === "cancelled" || !order.orderedAt || !order.receivedAt ||
        !Number.isFinite(order.orderedAt.getTime()) || !Number.isFinite(order.receivedAt.getTime()) ||
        order.receivedAt < order.orderedAt) continue;
    const orderedDay = tokyoCalendarDate(order.orderedAt);
    const receivedDay = tokyoCalendarDate(order.receivedAt);
    const days = (receivedDay.getTime() - orderedDay.getTime()) / DAY_MS;
    const key = JSON.stringify([order.supplierId, order.procurementShippingMethodId]);
    let group = groups.get(key);
    if (!group) {
      group = { orderDate: order.orderedAt, days: [], supplierId: order.supplierId,
        methodId: order.procurementShippingMethodId };
      groups.set(key, group);
    }
    group.days.push(days);
  }

  return Array.from(groups.values()).map(group => {
    const supplier = group.supplierId === null ? null : supplierById.get(group.supplierId) ?? null;
    const method = group.methodId === null ? null : methodById.get(group.methodId) ?? null;
    const expected = supplier && method ? resolveExpectedArrivalDate(group.orderDate,
      supplier.manualProcessingLeadDays, method.manualTransitLeadDays) : null;
    const configuredTotalDays = expected === null ? null :
      (expected.getTime() - tokyoCalendarDate(group.orderDate).getTime()) / DAY_MS;
    const sorted = group.days.sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const medianDays = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const meanDays = sorted.reduce((sum, days) => sum + days, 0) / sorted.length;
    const p80Days = sorted[Math.ceil(sorted.length * 0.8) - 1];
    return {
      supplierId: group.supplierId, supplierName: supplier?.name ?? null,
      shippingMethodId: group.methodId, shippingMethodName: method?.name ?? null,
      sampleCount: sorted.length, configuredTotalDays, medianDays, meanDays, p80Days,
      minDays: sorted[0], maxDays: sorted[sorted.length - 1],
      medianDeltaDays: configuredTotalDays === null ? null : medianDays - configuredTotalDays,
      meanDeltaDays: configuredTotalDays === null ? null : meanDays - configuredTotalDays,
      p80DeltaDays: configuredTotalDays === null ? null : p80Days - configuredTotalDays,
    };
  }).sort((a, b) => (a.supplierName ?? "").localeCompare(b.supplierName ?? "", "ja") ||
    (a.supplierId ?? -1) - (b.supplierId ?? -1) ||
    (a.shippingMethodName ?? "").localeCompare(b.shippingMethodName ?? "", "ja") ||
    (a.shippingMethodId ?? -1) - (b.shippingMethodId ?? -1));
}

export async function loadProcurementLeadTimeFeedback(db: PrismaClient): Promise<ProcurementLeadTimeFeedbackRow[]> {
  const [orders, suppliers, methods] = await Promise.all([
    db.orderRequest.findMany({
      where: { orderedAt: { not: null }, receivedAt: { not: null }, status: { not: "cancelled" } },
      select: { supplierId: true, procurementShippingMethodId: true, orderedAt: true, receivedAt: true, status: true },
    }),
    db.supplier.findMany({ select: { id: true, name: true,
      leadTimeSetting: { select: { manualProcessingLeadDays: true } } } }),
    db.procurementShippingMethod.findMany({ select: { id: true, name: true, manualTransitLeadDays: true } }),
  ]);
  return summarizeProcurementLeadTimes(orders, suppliers.map(row => ({ id: row.id, name: row.name,
    manualProcessingLeadDays: row.leadTimeSetting?.manualProcessingLeadDays ?? null })), methods);
}
