import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadSchedulerV2Preview } from "@/lib/scheduler-v2-preview";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await prisma.$transaction(tx => loadSchedulerV2Preview(tx), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
  return NextResponse.json(result);
}
