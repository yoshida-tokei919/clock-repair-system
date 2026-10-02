import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseProcurementId, parseSupplierLeadTimeInput } from "@/lib/procurement-settings-domain";
import { procurementSettingsResponseError, saveSupplierLeadTime } from "@/lib/procurement-settings";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseProcurementId((await params).id, "仕入先ID");
    const { manualProcessingLeadDays } = parseSupplierLeadTimeInput(await request.json());
    return NextResponse.json({ supplier: await saveSupplierLeadTime(prisma, id, manualProcessingLeadDays) });
  } catch (error) { const result = procurementSettingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
