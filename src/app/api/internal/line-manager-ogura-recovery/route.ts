import { NextRequest, NextResponse } from "next/server";
import { isN8nAuthorized } from "../slack-notifications/_auth";
import { prisma } from "@/lib/prisma";
import { OguraRecoveryConflictError, OguraRecoveryInputError, OguraRecoveryPartialError, recoverOgura } from "@/lib/line-manager-ogura-recovery";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, status: "unavailable" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, status: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const result = await recoverOgura(prisma, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof OguraRecoveryInputError || error instanceof SyntaxError) return NextResponse.json({ ok: false, status: "invalid_request" }, { status: 400 });
    if (error instanceof OguraRecoveryConflictError) return NextResponse.json({ ok: false, status: "conflict" }, { status: 409 });
    if (error instanceof OguraRecoveryPartialError) return NextResponse.json({ ok: false, status: "partial_retryable" }, { status: 503 });
    return NextResponse.json({ ok: false, status: "unavailable" }, { status: 503 });
  }
}
