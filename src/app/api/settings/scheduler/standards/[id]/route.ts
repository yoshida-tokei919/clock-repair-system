import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsError, parseStandardInput } from "@/lib/scheduler-settings-domain";
import { assertUniqueStandard, settingsResponseError, validateStandardMasters } from "@/lib/scheduler-settings";

function idFromParams(params: { id: string }) {
  if (!/^\d+$/.test(params.id)) throw new SettingsError("標準作業時間IDが正しくありません。");
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new SettingsError("標準作業時間IDが正しくありません。");
  return id;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = idFromParams(await params);
    const input = parseStandardInput(await request.json());
    await validateStandardMasters(prisma, input);
    await assertUniqueStandard(prisma, input, id);
    return NextResponse.json({ standard: await prisma.repairWorkTimeStandard.update({ where: { id }, data: input }) });
  } catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = idFromParams(await params);
    await prisma.repairWorkTimeStandard.delete({ where: { id } });
    return NextResponse.json({ deletedId: id });
  } catch (error) { const result = settingsResponseError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
