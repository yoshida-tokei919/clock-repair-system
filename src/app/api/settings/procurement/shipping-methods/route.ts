import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseShippingMethodInput } from "@/lib/procurement-settings-domain";
import { procurementSettingsResponseError } from "@/lib/procurement-settings";

export async function POST(request: Request) {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = parseShippingMethodInput(await request.json());
    return NextResponse.json({ shippingMethod: await prisma.procurementShippingMethod.create({ data: input }) }, { status: 201 });
  } catch (error) { const result = procurementSettingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
