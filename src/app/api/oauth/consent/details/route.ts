import { NextResponse } from "next/server";
import { consentBearerToken, consentRouteError, getMcpConsentDetails, parseAuthorizationId } from "@/lib/chatgpt-mcp-oauth-consent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = consentBearerToken(request);
    const body = await request.json() as { authorizationId?: unknown };
    const item = await getMcpConsentDetails(token, parseAuthorizationId(body.authorizationId));
    return NextResponse.json({ ok: true, item }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const { status, code } = consentRouteError(error);
    return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "no-store" } });
  }
}
