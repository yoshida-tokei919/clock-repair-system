import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStandardInput } from "@/lib/scheduler-settings-domain";
import { assertUniqueStandard, settingsResponseError, validateStandardMasters } from "@/lib/scheduler-settings";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json({ standards: await prisma.repairWorkTimeStandard.findMany({ orderBy: { id: "asc" } }) }); }
  catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = parseStandardInput(await request.json());
    await validateStandardMasters(prisma, input);
    await assertUniqueStandard(prisma, input);
    return NextResponse.json({ standard: await prisma.repairWorkTimeStandard.create({ data: input }) }, { status: 201 });
  } catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
