import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPublicRepairDeliveryPreference,
  RepairDeliveryPreferenceError,
  savePublicRepairDeliveryPreference,
} from "@/lib/repair-delivery-preference";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

function failure(error: unknown) {
  if (error instanceof RepairDeliveryPreferenceError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  console.error("Public delivery preference error", error);
  return NextResponse.json({ ok: false, error: "回答を処理できませんでした。" }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const data = await getPublicRepairDeliveryPreference(prisma, (await params).token);
    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) {
    return NextResponse.json({ ok: false, error: "JSON body required" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "入力が不正です。" }, { status: 400 });
  }

  try {
    const data = await savePublicRepairDeliveryPreference(prisma, (await params).token, body);
    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
