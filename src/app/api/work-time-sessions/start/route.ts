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
    const expected = request.headers.get("x-expected-active-session");
    const expectedActiveId = expected === null ? undefined : expected === "none" ? null : Number(expected);
    if (expectedActiveId !== undefined && expectedActiveId !== null && (!Number.isSafeInteger(expectedActiveId) || expectedActiveId <= 0))
      return NextResponse.json({ error: "Invalid expected session." }, { status: 400 });
    return NextResponse.json({ session: await startWorkTimeSession(prisma, input, expectedActiveId) });
  } catch (error) {
    if (error instanceof WorkTimeInputError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: error.message.startsWith("Active timer changed") ? 409 : 400 });
    }
    throw error;
  }
}
