import { NextRequest, NextResponse } from "next/server";
import { isN8nAuthorized } from "../../slack-notifications/_auth";
import { prisma } from "@/lib/prisma";
import { importObservedBatch, MAX_IMPORT_BYTES, ObservedSyncConflictError, ObservedSyncInputError, parseObservedStartAt, verifyObservedSignature } from "@/lib/line-manager-observed-sync";

export const dynamic = "force-dynamic";

async function readBounded(request: NextRequest): Promise<Buffer | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_IMPORT_BYTES) { await reader.cancel(); return null; }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null || !process.env.LINE_MANAGER_SYNC_SIGNING_KEY) return NextResponse.json({ ok: false }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false }, { status: 401 });
  let startAt: string | undefined;
  try {
    startAt = process.env.LINE_MANAGER_SYNC_START_AT;
    parseObservedStartAt(startAt, Date.now());
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const timestamp = request.headers.get("x-line-manager-sync-timestamp");
  const signature = request.headers.get("x-line-manager-sync-signature");
  if (!timestamp || !signature) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const raw = await readBounded(request);
    if (!raw) return NextResponse.json({ ok: false }, { status: 413 });
    if (!verifyObservedSignature(raw, timestamp, signature, process.env.LINE_MANAGER_SYNC_SIGNING_KEY)) return NextResponse.json({ ok: false }, { status: 401 });
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    return NextResponse.json({ ok: true, ...await importObservedBatch(prisma, body, new Date(), startAt) });
  } catch (error) {
    if (error instanceof ObservedSyncInputError || error instanceof SyntaxError || error instanceof TypeError) return NextResponse.json({ ok: false }, { status: 400 });
    if (error instanceof ObservedSyncConflictError) return NextResponse.json({ ok: false }, { status: 409 });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
