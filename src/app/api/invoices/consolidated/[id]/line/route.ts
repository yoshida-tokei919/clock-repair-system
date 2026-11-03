import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { ConsolidatedOperationError, queueConsolidatedInvoiceLine } from "@/lib/consolidated-invoice-operations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const raw = (await params).id;
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) return NextResponse.json({ error: "集約請求IDが不正です。" }, { status: 400 });
  if ((await request.text()).trim()) return NextResponse.json({ error: "この操作に入力値は不要です。" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...await queueConsolidatedInvoiceLine(prisma, id, request.url) });
  } catch (error) {
    if (error instanceof ConsolidatedOperationError) return NextResponse.json({ error: error.message,
      deliveryMethod: error.postal ? "POSTAL" : undefined }, { status: 409 });
    console.error("Consolidated invoice LINE queue failed", { id, error });
    return NextResponse.json({ error: "送信待ちの状態を確認できません。再送せず履歴を確認してください。" }, { status: 409 });
  }
}
