import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertScheduleRevision, scheduleRevision, StaleScheduleError } from "@/lib/auto-schedule-revision";
import { buildSchedulePreview, isScheduleChange, SCHEDULABLE_STATUS, SCHEDULE_HORIZON_DAYS, todayInJapan } from "@/lib/simple-auto-scheduler";
import { parseWorkDate } from "@/lib/work-calendar";

export const dynamic = "force-dynamic";

async function loadSchedule(tx: Prisma.TransactionClient, startDate: string) {
  const start = parseWorkDate(startDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + SCHEDULE_HORIZON_DAYS);
  const [repairs, exceptions] = await Promise.all([
    tx.repair.findMany({
      select: {
        id: true, inquiryNumber: true, status: true, scheduleLocked: true,
        scheduledDate: true, estimatedWorkMinutes: true, priorityScore: true,
        deliveryDateExpected: true, receptionDate: true, updatedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    tx.workCalendar.findMany({
      where: { workDate: { gte: start, lt: end } },
      select: { workDate: true, availableMinutes: true, note: true, updatedAt: true },
      orderBy: { workDate: "asc" },
    }),
  ]);
  const preview = buildSchedulePreview(startDate, repairs, exceptions);
  const revision = scheduleRevision({ startDate, repairs, exceptions });
  return { preview, revision };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const startDate = todayInJapan(new Date());
  const result = await prisma.$transaction(tx => loadSchedule(tx, startDate), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let revision: string;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !("revision" in body) ||
      typeof body.revision !== "string" || !/^[0-9a-f]{64}$/.test(body.revision)) {
      throw new Error("Invalid schedule revision.");
    }
    revision = body.revision;
  } catch {
    return NextResponse.json({ error: "Invalid schedule revision." }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const current = await loadSchedule(tx, todayInJapan(new Date()));
      assertScheduleRevision(revision, current.revision);
      let updated = 0;
      for (const placement of current.preview.placements) {
        if (!isScheduleChange(placement)) continue;
        const result = await tx.repair.updateMany({
          where: {
            id: placement.id,
            status: SCHEDULABLE_STATUS,
            scheduleLocked: false,
            estimatedWorkMinutes: placement.estimatedWorkMinutes,
          },
          data: { scheduledDate: parseWorkDate(placement.proposedDate) },
        });
        if (result.count !== 1) throw new StaleScheduleError("予定が変更されました。再プレビューしてください。");
        updated++;
      }
      return { updated, startDate: current.preview.startDate };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StaleScheduleError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return NextResponse.json({ error: "予定が変更されました。再プレビューしてください。" }, { status: 409 });
    }
    throw error;
  }
}
