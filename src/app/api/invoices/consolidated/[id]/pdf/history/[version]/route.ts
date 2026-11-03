import { createHash } from "node:crypto";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { downloadConsolidatedPdf } from "@/lib/r2-consolidated-invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const { id: idRaw, version: versionRaw } = await params;
  const id = Number(idRaw), version = Number(versionRaw);
  if (!/^[1-9]\d*$/.test(idRaw) || !/^[1-9]\d*$/.test(versionRaw) ||
    !Number.isSafeInteger(id) || !Number.isSafeInteger(version)) return new Response("Not found", { status: 404 });
  const row = await prisma.consolidatedInvoicePdfHistory.findUnique({ where: {
    consolidatedInvoiceId_version: { consolidatedInvoiceId: id, version },
  } });
  if (!row) return new Response("Not found", { status: 404 });
  try {
    const buffer = await downloadConsolidatedPdf(row.storageKey);
    if (buffer.length !== row.fileSize || createHash("sha256").update(buffer).digest("hex") !== row.hash) throw new Error("PDF integrity mismatch");
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${row.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("Consolidated historical PDF read failed", { id, version, error });
    return new Response("PDF unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
