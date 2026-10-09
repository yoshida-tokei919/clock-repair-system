import { requireAdminApi } from "@/lib/admin-api-auth";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { loadDeadlineCapacityPreview } from "@/lib/deadline-capacity-preview";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const result = await prisma.$transaction(tx => loadDeadlineCapacityPreview(tx), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
  return NextResponse.json(result);
}
