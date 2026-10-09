import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProcurementSettings, procurementSettingsResponseError } from "@/lib/procurement-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json(await getProcurementSettings(prisma)); }
  catch (error) { const result = procurementSettingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
