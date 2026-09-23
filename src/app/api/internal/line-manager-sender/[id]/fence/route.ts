import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fenceLineManagerSenderPost, LineManagerSenderInputError, parseLineManagerSenderId, parseLineManagerSenderJson } from "@/lib/line-manager-sender-internal";
import { isN8nAuthorized } from "../../../slack-notifications/_auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, error: "N8N internal token is not configured" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const ok = await fenceLineManagerSenderPost(prisma, parseLineManagerSenderId(params.id), await parseLineManagerSenderJson(request));
    return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
  } catch (error) {
    if (error instanceof LineManagerSenderInputError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    throw error;
  }
}
