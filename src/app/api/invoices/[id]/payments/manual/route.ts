import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { createInvoicePayment } from "@/lib/invoice-payment";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const invoiceId = Number(params.id);
  if (!Number.isInteger(invoiceId)) {
    return NextResponse.json({ ok: false, error: "Invalid invoice id" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, customerId: true, customer: { select: { type: true } } },
  });
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.customer.type !== "individual") {
    return NextResponse.json({ ok: false, error: "銀行振込の手動入金登録はB2C請求書のみ対応しています" }, { status: 403 });
  }

  try {
    const payment = await createInvoicePayment(prisma, {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      provider: "MANUAL",
      method: "BANK_TRANSFER",
      status: "SUCCEEDED",
      paidAt: new Date(),
    });
    return NextResponse.json({ ok: true, paymentId: payment.id });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "銀行振込の入金登録に失敗しました",
    }, { status: 409 });
  }
}
