import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextRequest, NextResponse } from "next/server";
import { InvoiceDeliveryUnavailableError, queueInvoiceLineDelivery } from "@/lib/invoice-delivery-routing";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const rawId = (await params).id;
  const invoiceId = Number(rawId);
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(invoiceId)) {
    return NextResponse.json({ ok: false, error: "請求書IDが不正です。" }, { status: 400 });
  }
  try {
    const result = await queueInvoiceLineDelivery(prisma, invoiceId, request.url);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof InvoiceDeliveryUnavailableError) {
      return NextResponse.json({ ok: false, deliveryMethod: error.postal ? "POSTAL" : undefined, error: error.message }, { status: error.status });
    }
    if (error instanceof LineManagerSendOutboxError) {
      return NextResponse.json({ ok: false, error: "LINE送信待ちの内容が変更されています。履歴を確認してください。" }, { status: 409 });
    }
    console.error("Invoice LINE outbox creation failed", { invoiceId, error });
    return NextResponse.json({ ok: false, error: "LINE送信待ちを作成できませんでした。再読み込みして状態を確認してください。" }, { status: 500 });
  }
}
