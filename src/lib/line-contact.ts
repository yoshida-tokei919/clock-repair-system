import type { Prisma } from "@prisma/client";

export type LineContactCustomer = {
  id: number; type: string; lineContactCustomerId: number | null;
};

export function validateLineContactSelection(source: LineContactCustomer, selectedId: number | null, target: LineContactCustomer | null) {
  if (source.type !== "business") throw new Error("法人顧客のみLINE連絡先を設定できます。");
  if (selectedId === null) return null;
  if (!Number.isSafeInteger(selectedId) || selectedId <= 0 || selectedId === source.id ||
      !target || target.id !== selectedId || target.type !== "business" || target.lineContactCustomerId !== null) {
    throw new Error("LINE連絡先には代理設定のない別の法人顧客を指定してください。");
  }
  return selectedId;
}

export async function lockLineContactCustomers(tx: Prisma.TransactionClient, ids: number[]) {
  const rows = new Map<number, LineContactCustomer>();
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const found = await tx.$queryRaw<LineContactCustomer[]>`
      SELECT "id", "type", "lineContactCustomerId" FROM "Customer" WHERE "id" = ${id} FOR UPDATE`;
    if (found.length !== 1) throw new Error("LINE連絡先の顧客が変更されました。再読み込みしてください。");
    rows.set(id, found[0]);
  }
  return rows;
}

/** Observe first; lock source and delegate in ID order before document or Repair locks. */
export async function resolveLockedLineContact(tx: Prisma.TransactionClient, sourceId: number) {
  const observed = await tx.customer.findUnique({ where: { id: sourceId }, select: { lineContactCustomerId: true } });
  if (!observed) throw new Error("顧客が見つかりません。");
  const rows = await lockLineContactCustomers(tx, [sourceId, ...(observed.lineContactCustomerId === null ? [] : [observed.lineContactCustomerId])]);
  const source = rows.get(sourceId)!;
  if (source.lineContactCustomerId !== observed.lineContactCustomerId) throw new Error("LINE連絡先設定が変更されました。再読み込みしてください。");
  if (source.type !== "business") return { source, contactCustomerId: sourceId };
  const target = source.lineContactCustomerId === null ? null : rows.get(source.lineContactCustomerId) ?? null;
  validateLineContactSelection(source, source.lineContactCustomerId, target);
  return { source, contactCustomerId: source.lineContactCustomerId ?? sourceId };
}
