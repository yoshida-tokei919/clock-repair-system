import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSettingsRows, parseSchedulerInput } from "@/lib/scheduler-settings-domain";
import { getSchedulerSettings, settingsResponseError } from "@/lib/scheduler-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await getSchedulerSettings(prisma)); }
  catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function PUT(request: Request) {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = parseSchedulerInput(await request.json());
    const setting = await prisma.$transaction(async tx => {
      const [current, activities] = await Promise.all([
        tx.schedulerSetting.findUnique({ where: { id: 1 } }), tx.schedulerActivitySetting.findMany({ select: { activityType: true } }),
      ]);
      assertSettingsRows(current, activities);
      return tx.schedulerSetting.update({ where: { id: 1 }, data: input });
    });
    return NextResponse.json({ setting });
  } catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
