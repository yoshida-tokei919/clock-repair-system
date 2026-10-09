import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseProcurementId, parseSupplierLeadTimeInput } from "@/lib/procurement-settings-domain";
import { procurementSettingsResponseError, saveSupplierLeadTime } from "@/lib/procurement-settings";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const id = parseProcurementId((await params).id, "仕入先ID");
    const { manualProcessingLeadDays } = parseSupplierLeadTimeInput(await request.json());
    return NextResponse.json({ supplier: await saveSupplierLeadTime(prisma, id, manualProcessingLeadDays) });
  } catch (error) { const result = procurementSettingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
