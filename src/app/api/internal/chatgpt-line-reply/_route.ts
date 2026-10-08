import { NextRequest, NextResponse } from "next/server";
import { isN8nAuthorized } from "../slack-notifications/_auth";
import { BridgeInputError, bridgeError } from "@/lib/chatgpt-line-reply-bridge";

export async function bridgeRoute(request: NextRequest, action: (body: unknown) => Promise<unknown>) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    let body: unknown;
    try { body = await request.json(); } catch { throw new BridgeInputError(); }
    return NextResponse.json({ ok: true, item: await action(body) });
  } catch (error) {
    const { status, code } = bridgeError(error);
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}
