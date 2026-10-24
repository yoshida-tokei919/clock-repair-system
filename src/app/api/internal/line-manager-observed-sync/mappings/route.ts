import { NextRequest, NextResponse } from "next/server";
import { isN8nAuthorized } from "../../slack-notifications/_auth";
import { prisma } from "@/lib/prisma";
import { listObservedMappings, ObservedSyncConflictError, ObservedSyncInputError } from "@/lib/line-manager-observed-sync";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await request.json();
    const afterId = body?.afterId;
    const result = await listObservedMappings(prisma, afterId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ObservedSyncInputError || error instanceof SyntaxError) return NextResponse.json({ ok: false }, { status: 400 });
    if (error instanceof ObservedSyncConflictError) return NextResponse.json({ ok: false }, { status: 409 });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
