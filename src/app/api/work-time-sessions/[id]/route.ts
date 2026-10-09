import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCorrectionInput, parsePathId, WorkTimeInputError } from "@/lib/work-time-session-domain";
import { correctWorkTimeSession } from "@/lib/work-time-sessions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const id = parsePathId((await params).id);
    const input = parseCorrectionInput(await request.json());
    const session = await correctWorkTimeSession(prisma, id, input);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof WorkTimeInputError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
