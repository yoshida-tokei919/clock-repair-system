import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { getRepairPhotoSignedReadUrl, isR2RepairPhotoKey } from "@/lib/r2-repair-photos";

const MAX_BODY_BYTES = 1024;
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function errorResponse(status: number) {
  return NextResponse.json({ error: "Unable to load photo URLs" }, { status, headers: NO_STORE });
}

async function readIds(request: Request): Promise<number[] | null> {
  if (!request.body || Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    if (Object.keys(record).length !== 1 || !Array.isArray(record.ids)) return null;
    const ids = record.ids;
    if (ids.length < 1 || ids.length > 50 || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) return null;
    if (new Set(ids).size !== ids.length) return null;
    return ids;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) {
    unauthorized.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
    return unauthorized;
  }

  const ids = await readIds(request);
  if (!ids) return errorResponse(400);

  try {
    const photos = await prisma.repairPhoto.findMany({
      where: { id: { in: ids } },
      select: { id: true, storageKey: true },
    });
    const urls = Object.fromEntries(await Promise.all(
      photos.filter((photo) => isR2RepairPhotoKey(photo.storageKey)).map(async (photo) =>
        [photo.id, await getRepairPhotoSignedReadUrl(photo.storageKey)] as const),
    ));
    return NextResponse.json({ urls }, { headers: NO_STORE });
  } catch {
    return errorResponse(500);
  }
}
