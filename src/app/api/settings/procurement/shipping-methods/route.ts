import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShippingMethodInput } from "@/lib/procurement-settings-domain";
import { procurementSettingsResponseError } from "@/lib/procurement-settings";

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = parseShippingMethodInput(await request.json());
    return NextResponse.json({ shippingMethod: await prisma.procurementShippingMethod.create({ data: input }) }, { status: 201 });
  } catch (error) { const result = procurementSettingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
