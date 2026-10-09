import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSettingsRows, parseSchedulerInput } from "@/lib/scheduler-settings-domain";
import { getSchedulerSettings, settingsResponseError } from "@/lib/scheduler-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json(await getSchedulerSettings(prisma)); }
  catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function PUT(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
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
