import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProcurementSettings, procurementSettingsResponseError } from "@/lib/procurement-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await getProcurementSettings(prisma)); }
  catch (error) { const result = procurementSettingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
