import "server-only";

import crypto from "crypto";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const DOCUMENTS_BUCKET = "documents";
const PDF_CONTENT_TYPE = "application/pdf";

export function buildInvoicePdfStorageKey(invoiceId: number, pdfFileId: number): string {
  return `invoices/${invoiceId}/${pdfFileId}.pdf`;
}

export async function uploadInvoicePdf(
  storageKey: string,
  pdfBuffer: Buffer,
  contentType = PDF_CONTENT_TYPE
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storageKey, pdfBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Invoice PDF upload failed: ${error.message}`);
  }
}

export async function downloadInvoicePdf(storageKey: string): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(storageKey);

  if (error || !data) {
    throw new Error(`Invoice PDF download failed: ${error?.message ?? "file not found"}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function deleteInvoicePdf(storageKey: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([storageKey]);

  if (error) {
    throw new Error(`Invoice PDF delete failed: ${error.message}`);
  }
}

export function calculateInvoicePdfHash(pdfBuffer: Buffer): string {
  return crypto.createHash("sha256").update(pdfBuffer).digest("hex");
}
