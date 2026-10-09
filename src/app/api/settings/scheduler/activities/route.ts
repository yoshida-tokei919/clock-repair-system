import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSettingsRows, parseActivityInput } from "@/lib/scheduler-settings-domain";
import { settingsResponseError } from "@/lib/scheduler-settings";

export async function PUT(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = parseActivityInput(await request.json());
    const row = await prisma.$transaction(async tx => {
      const [setting, activities] = await Promise.all([
        tx.schedulerSetting.findUnique({ where: { id: 1 } }), tx.schedulerActivitySetting.findMany({ select: { activityType: true } }),
      ]);
      assertSettingsRows(setting, activities);
      return tx.schedulerActivitySetting.update({ where: { activityType: input.activityType }, data: {
        manualStandardMinutes: input.manualStandardMinutes, dailyReservedMinutes: input.dailyReservedMinutes,
        learningMode: input.learningMode, aggregationMethod: input.aggregationMethod, lookbackMonths: input.lookbackMonths,
        fallbackLookbackMonths: input.fallbackLookbackMonths, minimumSamples: input.minimumSamples,
      } });
    });
    return NextResponse.json({ activity: row });
  } catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
