import type { PrismaClient } from "@prisma/client";
import { parsePhysicalTagIdentifier, PhysicalTagIdentifierError } from "./physical-tag-resolver";

export class PhysicalTagNfcBindError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export function parsePhysicalTagNfcBind(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new PhysicalTagNfcBindError(400, "入力が不正です。");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 3 ||
      Object.keys(value).some(key => !["physicalTagId", "repairId", "nfcUid"].includes(key)) ||
      ![value.physicalTagId, value.repairId].every(id =>
        typeof id === "number" && Number.isInteger(id) && id >= 1 && id <= 2147483647))
    throw new PhysicalTagNfcBindError(400, "入力が不正です。");
  try {
    const identifier = parsePhysicalTagIdentifier({ type: "NFC_UID", value: value.nfcUid });
    return { physicalTagId: value.physicalTagId as number, repairId: value.repairId as number,
      nfcUid: identifier.value };
  } catch (error) {
    if (error instanceof PhysicalTagIdentifierError)
      throw new PhysicalTagNfcBindError(400, "NFC UIDが不正です。");
    throw error;
  }
}

export function physicalTagNfcBindFailure(error: unknown) {
  if (error instanceof PhysicalTagNfcBindError) return { status: error.status, message: error.message };
  if (error && typeof error === "object" && "code" in error &&
      (error.code === "P2002" || error.code === "P2034"))
    return { status: 409, message: "NFC UIDまたはタグの状態が競合しました。再確認してください。" };
  return { status: 500, message: "NFC UIDを登録できませんでした。" };
}

export async function bindPhysicalTagNfcUid(
  db: PrismaClient, input: { physicalTagId: number; repairId: number; nfcUid: string },
) {
  const tag = await db.physicalTag.findUnique({
    where: { id: input.physicalTagId }, select: { id: true, status: true, nfcUid: true },
  });
  if (!tag) throw new PhysicalTagNfcBindError(404, "管理タグが見つかりません。");
  if (tag.status !== "ACTIVE" || tag.nfcUid !== null)
    throw new PhysicalTagNfcBindError(409, "管理タグは登録できない状態です。");

  // The database enforces UID uniqueness. This condition also guards an assignment
  // change between the initial read and the write, and prevents a second binder from overwriting.
  const updated = await db.physicalTag.updateMany({
    where: { id: input.physicalTagId, status: "ACTIVE", nfcUid: null,
      assignments: { some: { repairId: input.repairId, releasedAt: null } } },
    data: { nfcUid: input.nfcUid },
  });
  if (updated.count !== 1)
    throw new PhysicalTagNfcBindError(409, "現在の割当または管理タグの状態が変わりました。再確認してください。");
  return { physicalTagId: input.physicalTagId, repairId: input.repairId, nfcUid: input.nfcUid };
}
