import { NextResponse } from "next/server";
import { McpAuthConfigurationError, mcpProtectedResourceMetadata } from "@/lib/chatgpt-mcp-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(mcpProtectedResourceMetadata(), { headers: { "cache-control": "public, max-age=300" } });
  } catch (error) {
    if (error instanceof McpAuthConfigurationError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
