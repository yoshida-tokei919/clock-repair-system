import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { loadDeadlineCapacityPreview } from "@/lib/deadline-capacity-preview";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await prisma.$transaction(tx => loadDeadlineCapacityPreview(tx), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
  return NextResponse.json(result);
}
