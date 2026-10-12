import { NextRequest, NextResponse } from "next/server";
import { isN8nAuthorized } from "../slack-notifications/_auth";
import {
  CommunicationAiInputError,
  CommunicationAiNotFoundError,
  CommunicationAiStaleError,
} from "@/lib/communication-ai-brief";

export async function communicationAiRoute(
  request: NextRequest,
  action: (body: unknown) => Promise<unknown>,
) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await action(body) as Record<string, unknown>) });
  } catch (error) {
    if (error instanceof CommunicationAiInputError) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }
    if (error instanceof CommunicationAiNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (error instanceof CommunicationAiStaleError) {
      return NextResponse.json({ ok: false, error: "stale" }, { status: 409 });
    }
    console.error("Communication AI internal route error", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
