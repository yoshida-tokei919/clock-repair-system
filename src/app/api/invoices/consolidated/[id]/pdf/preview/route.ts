import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { buildConsolidatedPdfData, hasConsolidatedSourceSnapshotIntegrity, isCurrentConsolidatedPdf } from "@/lib/consolidated-invoice-publication";
import { renderConsolidatedInvoicePdf } from "@/lib/consolidated-invoice-pdf";
import { historicalRefundAllocationSelect } from "@/lib/b2b-historical-refund-allocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const raw = (await params).id;
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) return new Response("Not found", { status: 404 });
  const bundle = await prisma.consolidatedInvoice.findUnique({ where: { id }, include: {
    publication: true, issueState: true, sources: { orderBy: { id: "asc" }, include: { deliveryNotes: { orderBy: { id: "asc" } }, invoice: { select: {
      id: true, invoiceNumber: true, customerId: true, issuedDate: true, totalAmount: true,
      taxAmount: true, shippingFeeAmount: true, grossTotalAmount: true, paymentDueDate: true,
      discountBasisAmount: true, discountRateBps: true, discountAmount: true,
      historicalRefundAllocations: { select: historicalRefundAllocationSelect, orderBy: { id: "asc" } },
    } } } },
  } });
  if (!bundle || !isCurrentConsolidatedPdf(bundle.publication)) return new Response("Not found", { status: 404 });
  try {
    if (!hasConsolidatedSourceSnapshotIntegrity(bundle)) throw new Error("Source snapshot mismatch");
    const data = buildConsolidatedPdfData(bundle, bundle.sources.map(source => source.invoice.paymentDueDate));
    const buffer = await renderConsolidatedInvoicePdf(data);
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="consolidated_invoice_${id}_preview.pdf"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("Consolidated PDF preview unavailable", { id, error });
    return new Response("Preview unavailable: incomplete or inconsistent invoice snapshot", { status: 409, headers: { "Cache-Control": "no-store" } });
  }
}
