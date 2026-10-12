import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicIntakeShippingDecision, IntakeShippingDecisionError, respondIntakeShippingDecision } from "@/lib/intake-shipping-decision";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
function failure(error: unknown) {
  if (error instanceof IntakeShippingDecisionError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Public intake shipping decision failed");
  return NextResponse.json({ error: "回答を処理できませんでした。" }, { status: 500 });
}
export async function GET(_request: Request, { params }: Context) {
  try { return NextResponse.json({ ok: true, decision: await getPublicIntakeShippingDecision(prisma, (await params).token) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !["SHIP_COMPLETED", "WAIT_ALL"].includes((body as { choice?: string }).choice ?? "")) return NextResponse.json({ error: "回答を選択してください。" }, { status: 400 });
  try { return NextResponse.json({ ok: true, decision: await respondIntakeShippingDecision(prisma, (await params).token, (body as { choice: "SHIP_COMPLETED" | "WAIT_ALL" }).choice) }); }
  catch (error) { return failure(error); }
}
