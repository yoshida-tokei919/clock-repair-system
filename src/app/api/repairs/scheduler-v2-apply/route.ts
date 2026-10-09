import { requireAdminApi } from "@/lib/admin-api-auth";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applySchedulerV2Revision, isSchedulerV2ApplyConflict, parseSchedulerV2ApplyBody } from "@/lib/scheduler-v2-apply";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  let revision: string;
  try {
    revision = parseSchedulerV2ApplyBody(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid schedule revision." }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(tx => applySchedulerV2Revision(tx, revision), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isSchedulerV2ApplyConflict(error)) {
      return NextResponse.json({ error: "予定が変更されました。再プレビューしてください。" }, { status: 409 });
    }
    throw error;
  }
}
