import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import { getAdminIntakeShippingDecision, IntakeShippingDecisionError, requestIntakeShippingDecision } from "@/lib/intake-shipping-decision";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function authorized() {
  const session = await getServerSession(authOptions);
  return !!session?.user?.email && !!await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
}
function idFrom(value: string) { const id = Number(value); return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null; }
function failure(error: unknown) {
  if (error instanceof IntakeShippingDecisionError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof LineManagerSendOutboxError) return NextResponse.json({ error: "LINE送信依頼の内容が既存の依頼と一致しません。" }, { status: 409 });
  console.error("Intake shipping decision request failed");
  return NextResponse.json({ error: "発送確認依頼を処理できませんでした。" }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  if (!await authorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = idFrom((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid Repair ID" }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...await getAdminIntakeShippingDecision(prisma, id) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Context) {
  if (!await authorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = idFrom((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid Repair ID" }, { status: 400 });
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { confirmed?: unknown }).confirmed !== true) return NextResponse.json({ error: "明示確認が必要です。" }, { status: 400 });
  try { return NextResponse.json({ ok: true, decision: await requestIntakeShippingDecision(prisma, id, process.env.NEXT_PUBLIC_APP_URL) }); }
  catch (error) { return failure(error); }
}
