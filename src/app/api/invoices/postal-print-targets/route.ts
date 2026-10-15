import { requireAdminApi } from "@/lib/admin-api-auth";
import { getInvoiceDeliveryState } from "@/lib/invoice-delivery-routing";
import { prisma } from "@/lib/prisma";
import { isPostalInvoicePrintTarget } from "@/lib/postal-invoice-print";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["issued", "paid"] }, customer: { type: "business" } },
    orderBy: [{ invoiceNumber: "asc" }, { id: "asc" }],
    select: {
      id: true, invoiceNumber: true, status: true,
      customer: { select: { name: true, companyName: true, type: true } },
      billingCustomer: { select: { name: true, companyName: true } },
      currentPdfFile: { select: { status: true, storageKey: true } },
    },
  });
  const ready = invoices.filter(invoice => invoice.currentPdfFile?.status === "current" && Boolean(invoice.currentPdfFile.storageKey));
  const states = await Promise.all(ready.map(invoice => getInvoiceDeliveryState(prisma, invoice.id)));
  return NextResponse.json(ready.filter((invoice, index) => isPostalInvoicePrintTarget(invoice, states[index])).map(invoice => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.billingCustomer?.companyName || invoice.billingCustomer?.name || invoice.customer.companyName || invoice.customer.name,
  })));
}
