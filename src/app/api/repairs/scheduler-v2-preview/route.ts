import { requireAdminApi } from "@/lib/admin-api-auth";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadSchedulerV2PreviewWithFeedback } from "@/lib/scheduler-v2-preview";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const result = await prisma.$transaction(tx => loadSchedulerV2PreviewWithFeedback(tx), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
  return NextResponse.json(result);
}
