import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseStartInput, WorkTimeInputError } from "@/lib/work-time-session-domain";
import { startWorkTimeSession } from "@/lib/work-time-sessions";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
