import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isCurrentConsolidatedPdf, validConsolidatedShareToken } from "@/lib/consolidated-invoice-publication";
import { downloadConsolidatedPdf } from "@/lib/r2-consolidated-invoice-pdf";
import { consolidatedShareRevoked } from "@/lib/issued-invoice-public-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  if (!validConsolidatedShareToken(token)) return new Response("Not found", { status: 404 });
  const publication = await prisma.consolidatedInvoicePublication.findUnique({ where: { publicToken: token } });
  if (!isCurrentConsolidatedPdf(publication)) {
    return new Response("Not found", { status: 404 });
  }
  const supersession = await prisma.consolidatedInvoiceSupersession.findUnique({ where: { oldBundleId: publication.consolidatedInvoiceId }, select: { id: true } });
  const voidSources = await prisma.invoice.count({ where: { consolidatedSource: { consolidatedInvoiceId: publication.consolidatedInvoiceId }, status: { notIn: ["issued", "paid"] } } });
  if (consolidatedShareRevoked(supersession) || voidSources > 0) {
    return new Response("This invoice was canceled", { status: 410, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const buffer = await downloadConsolidatedPdf(publication.storageKey);
    if (buffer.length !== publication.fileSize || createHash("sha256").update(buffer).digest("hex") !== publication.hash) {
      throw new Error("PDF integrity mismatch");
    }
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${publication.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("Consolidated PDF read failed", { publicationId: publication.id, error });
    return new Response("PDF unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
