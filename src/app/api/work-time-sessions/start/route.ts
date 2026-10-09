import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStartInput, WorkTimeInputError } from "@/lib/work-time-session-domain";
import { startWorkTimeSession } from "@/lib/work-time-sessions";

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = parseStartInput(await request.json());
    return NextResponse.json({ session: await startWorkTimeSession(prisma, input) });
  } catch (error) {
    if (error instanceof WorkTimeInputError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
