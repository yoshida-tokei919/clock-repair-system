import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditStorageLocation, parseStorageLocationAudit, storageLocationAuditFailure } from "@/lib/storage-location-audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await getServerSession(authOptions))?.user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }
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
