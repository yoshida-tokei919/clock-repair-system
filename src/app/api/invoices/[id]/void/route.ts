import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
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
    select: {
      id: true,
      status: true,
      invoiceNumber: true,
      currentPdfFileId: true,
      repairs: { select: { id: true } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status === "paid") {
    return NextResponse.json(
      { ok: false, error: "Paid invoice cannot be voided" },
      { status: 400 }
    );
  }

  if (invoice.status === "void" || invoice.status === "canceled") {
    return NextResponse.json(
      { ok: false, error: "Invoice already voided" },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "void" },
      select: { id: true, invoiceNumber: true, status: true },
    });

    const releasedRepairs = await tx.repair.updateMany({
      where: { invoiceId: invoice.id },
      data: { invoiceId: null },
    });

    return { updatedInvoice, releasedRepairCount: releasedRepairs.count };
  });

  return NextResponse.json({
    ok: true,
    invoiceId: result.updatedInvoice.id,
    invoiceNumber: result.updatedInvoice.invoiceNumber,
    status: result.updatedInvoice.status,
    releasedRepairCount: result.releasedRepairCount,
  });
}
