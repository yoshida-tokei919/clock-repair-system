import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { voidInvoice, InvoiceVoidError } from "@/lib/invoice-void";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }
  const admin = await prisma.admin.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!admin) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const rawId = (await params).id;
  const invoiceId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(invoiceId)) return Response.json({ ok: false, error: "Invalid invoice ID" }, { status: 400 });
  try {
    const result = await voidInvoice(prisma, invoiceId, admin.id);
    return Response.json({ ok: true, invoiceId: result.invoice.id, invoiceNumber: result.invoice.invoiceNumber,
      status: result.invoice.status, releasedRepairCount: result.releasedRepairCount,
      releasedAmount: result.releasedAmount });
  } catch (error) {
    if (error instanceof InvoiceVoidError) return Response.json({ ok: false, error: error.message }, { status: error.status });
    console.error("Invoice void failed", { invoiceId, error });
    return Response.json({ ok: false, error: "請求書取消に失敗しました" }, { status: 500 });
  }
}
