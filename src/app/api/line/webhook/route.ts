import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  console.log("LINE webhook payload:", JSON.stringify(body, null, 2));

  return NextResponse.json({ ok: true });
}
