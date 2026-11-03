import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { confirmConsolidatedBankReceipt, ConsolidatedOperationError } from "@/lib/consolidated-invoice-operations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const raw = (await params).id;
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) return NextResponse.json({ error: "集約請求IDが不正です。" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "入金確認が必要です。" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 || (body as { confirmed?: unknown }).confirmed !== true) {
    return NextResponse.json({ error: "実際の銀行入金を確認してください。" }, { status: 400 });
  }
  try { return NextResponse.json({ ok: true, ...await confirmConsolidatedBankReceipt(prisma, id) }); }
  catch (error) {
    if (error instanceof ConsolidatedOperationError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Consolidated bank receipt failed", { id, error });
    return NextResponse.json({ error: "入金登録の結果を確認できません。元請求書の入金履歴を確認してください。" }, { status: 409 });
  }
}
