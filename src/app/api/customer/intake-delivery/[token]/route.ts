import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicIntakeDeliveryPreference, IntakeDeliveryPreferenceError, savePublicIntakeDeliveryPreference } from "@/lib/intake-delivery-preference";
import { RepairDeliveryPreferenceError } from "@/lib/repair-delivery-preference";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
function failure(error: unknown) {
  if (error instanceof IntakeDeliveryPreferenceError || error instanceof RepairDeliveryPreferenceError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  console.error("Public intake delivery preference failed");
  return NextResponse.json({ ok: false, error: "回答を処理できませんでした。" }, { status: 500 });
}
export async function GET(_request: Request, { params }: Context) {
  try { return NextResponse.json({ ok: true, ...await getPublicIntakeDeliveryPreference(prisma, (await params).token) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) return NextResponse.json({ ok: false, error: "JSON body required" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "入力が不正です。" }, { status: 400 }); }
  try { return NextResponse.json({ ok: true, ...await savePublicIntakeDeliveryPreference(prisma, (await params).token, body) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
