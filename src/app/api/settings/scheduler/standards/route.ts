import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseStandardInput } from "@/lib/scheduler-settings-domain";
import { assertUniqueStandard, settingsResponseError, validateStandardMasters } from "@/lib/scheduler-settings";

export async function GET() {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ standards: await prisma.repairWorkTimeStandard.findMany({ orderBy: { id: "asc" } }) }); }
  catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request) {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = parseStandardInput(await request.json());
    await validateStandardMasters(prisma, input);
    await assertUniqueStandard(prisma, input);
    return NextResponse.json({ standard: await prisma.repairWorkTimeStandard.create({ data: input }) }, { status: 201 });
  } catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
