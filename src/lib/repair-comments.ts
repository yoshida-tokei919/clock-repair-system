export function parseRepairCommentId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function repairCommentsUrl(repairId: number, messageId?: number): string {
  return `/repairs/${repairId}/comments${messageId ? `#message-${messageId}` : ""}`;
}

export async function getRepairCommentAccess(
  rawId: string,
  authenticate: () => Promise<Response | null>,
  repairExists: (repairId: number) => Promise<boolean>,
): Promise<{ repairId: number; response: null } | { repairId: null; response: Response }> {
  const unauthorized = await authenticate();
  if (unauthorized) return { repairId: null, response: unauthorized };
  const repairId = parseRepairCommentId(rawId);
  if (repairId === null) return { repairId: null, response: Response.json({ error: "修理IDが不正です。" }, { status: 400 }) };
  if (!await repairExists(repairId)) return { repairId: null, response: Response.json({ error: "修理案件が見つかりません。" }, { status: 404 }) };
  return { repairId, response: null };
}

export async function getRecentRepairComments<T>(
  repairId: number,
  findMany: (query: { where: { repairId: number; senderType: { in: string[] } }; orderBy: { createdAt?: "desc"; id?: "desc" }[]; take: number }) => Promise<T[]>,
): Promise<T[]> {
  const latest = await findMany({
    where: { repairId, senderType: { in: ["partner", "shop"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return latest.reverse();
}
