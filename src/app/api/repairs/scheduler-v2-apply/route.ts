import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applySchedulerV2Revision, isSchedulerV2ApplyConflict, parseSchedulerV2ApplyBody } from "@/lib/scheduler-v2-apply";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
