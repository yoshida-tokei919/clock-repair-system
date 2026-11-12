import { NextRequest, NextResponse } from "next/server";
import { isN8nAuthorized } from "../../slack-notifications/_auth";
import { prisma } from "@/lib/prisma";
import { compareInboundAudit, InboundAuditConflictError, InboundAuditInputError } from "@/lib/line-manager-inbound-audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await request.json();
    const result = await compareInboundAudit(prisma, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof InboundAuditInputError || error instanceof SyntaxError) return NextResponse.json({ ok: false }, { status: 400 });
    if (error instanceof InboundAuditConflictError) return NextResponse.json({ ok: false }, { status: 409 });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
