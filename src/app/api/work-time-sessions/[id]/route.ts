import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCorrectionInput, parsePathId, WorkTimeInputError } from "@/lib/work-time-session-domain";
import { correctWorkTimeSession } from "@/lib/work-time-sessions";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await getServerSession(authOptions);
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parsePathId(params.id);
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
