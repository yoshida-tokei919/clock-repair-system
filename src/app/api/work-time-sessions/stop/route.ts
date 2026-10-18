import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stopWorkTimeSession } from "@/lib/work-time-sessions";
import { WorkTimeInputError } from "@/lib/work-time-session-domain";

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const expected = request.headers.get("x-expected-active-session");
  const expectedActiveId = expected === null ? undefined : Number(expected);
  if (expectedActiveId !== undefined && (!Number.isSafeInteger(expectedActiveId) || expectedActiveId <= 0))
    return NextResponse.json({ error: "Invalid expected session." }, { status: 400 });
  try {
    return NextResponse.json(await stopWorkTimeSession(prisma, expectedActiveId));
  } catch (error) {
    if (error instanceof WorkTimeInputError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
