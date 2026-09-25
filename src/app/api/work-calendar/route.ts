import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WORK_MINUTES,
  isDefaultWorkDay,
  parseWorkCalendarInput,
  parseWorkMonth,
  serializeWorkDate,
} from "@/lib/work-calendar";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let month;
  try {
    month = parseWorkMonth(new URL(request.url).searchParams.get("month"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid month" }, { status: 400 });
  }

  const rows = await prisma.workCalendar.findMany({
    where: { workDate: { gte: month.start, lt: month.end } },
    orderBy: { workDate: "asc" },
    select: { workDate: true, availableMinutes: true, note: true },
  });
  return NextResponse.json({
    month: month.month,
    defaultAvailableMinutes: DEFAULT_WORK_MINUTES,
    exceptions: rows.map(row => ({
      date: serializeWorkDate(row.workDate),
      availableMinutes: row.availableMinutes,
      note: row.note,
    })),
  });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input;
  try {
    input = parseWorkCalendarInput(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid calendar input" }, { status: 400 });
  }

  if (isDefaultWorkDay(input)) {
    await prisma.workCalendar.deleteMany({ where: { workDate: input.workDate } });
  } else {
    await prisma.workCalendar.upsert({
      where: { workDate: input.workDate },
      create: { workDate: input.workDate, availableMinutes: input.availableMinutes, note: input.note },
      update: { availableMinutes: input.availableMinutes, note: input.note },
    });
  }

  return NextResponse.json({
    date: input.date,
    availableMinutes: input.availableMinutes,
    note: input.note,
    isException: !isDefaultWorkDay(input),
  });
}
