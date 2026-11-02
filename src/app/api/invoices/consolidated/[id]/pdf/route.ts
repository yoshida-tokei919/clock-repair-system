import { createHash } from "node:crypto";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { downloadConsolidatedPdf } from "@/lib/r2-consolidated-invoice-pdf";
import { isCurrentConsolidatedPdf } from "@/lib/consolidated-invoice-publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const publication = await prisma.consolidatedInvoicePublication.findUnique({ where: { consolidatedInvoiceId: id } });
  if (!isCurrentConsolidatedPdf(publication)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const buffer = await downloadConsolidatedPdf(publication.storageKey);
    if (buffer.length !== publication.fileSize || createHash("sha256").update(buffer).digest("hex") !== publication.hash) throw new Error("PDF integrity mismatch");
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${publication.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("Consolidated admin PDF read failed", { id, publicationId: publication.id, error });
    return new Response("PDF unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
