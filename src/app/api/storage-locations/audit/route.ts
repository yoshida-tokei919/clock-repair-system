import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditStorageLocation, parseStorageLocationAudit, storageLocationAuditFailure } from "@/lib/storage-location-audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  let input;
  try {
    input = parseStorageLocationAudit(await request.json());
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }
  try {
    return NextResponse.json(await auditStorageLocation(prisma, input));
  } catch (error) {
    const failure = storageLocationAuditFailure(error);
    if (failure.status === 500) console.error("StorageLocation audit failed");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
