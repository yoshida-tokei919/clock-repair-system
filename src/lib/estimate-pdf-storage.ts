import "server-only";

import crypto from "crypto";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const DOCUMENTS_BUCKET = "documents";
const PDF_CONTENT_TYPE = "application/pdf";

export function buildEstimatePdfStorageKey(params: {
  estimateDocumentId: number;
  pdfFileId: number;
}) {
  return `estimates/${params.estimateDocumentId}/${params.pdfFileId}.pdf`;
}

export async function uploadEstimatePdf(params: {
  storageKey: string;
  buffer: Buffer;
}): Promise<{ storageKey: string; fileSize: number }> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(params.storageKey, params.buffer, {
      contentType: PDF_CONTENT_TYPE,
      upsert: false,
    });

  if (error) {
    throw new Error(`Estimate PDF upload failed: ${error.message}`);
  }

  return {
    storageKey: params.storageKey,
    fileSize: params.buffer.byteLength,
  };
}

export async function downloadEstimatePdf(storageKey: string): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(storageKey);

  if (error || !data) {
    throw new Error(`Estimate PDF download failed: ${error?.message ?? "file not found"}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function deleteEstimatePdf(storageKey: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([storageKey]);

  if (error) {
    throw new Error(`Estimate PDF delete failed: ${error.message}`);
  }
}

export function calculatePdfHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
