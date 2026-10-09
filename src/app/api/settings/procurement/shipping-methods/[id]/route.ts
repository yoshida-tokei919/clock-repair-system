import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseProcurementId, parseShippingMethodInput } from "@/lib/procurement-settings-domain";
import { procurementSettingsResponseError } from "@/lib/procurement-settings";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const id = parseProcurementId((await params).id, "配送方法ID");
    const input = parseShippingMethodInput(await request.json());
    return NextResponse.json({ shippingMethod: await prisma.procurementShippingMethod.update({ where: { id }, data: input }) });
  } catch (error) { const result = procurementSettingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
