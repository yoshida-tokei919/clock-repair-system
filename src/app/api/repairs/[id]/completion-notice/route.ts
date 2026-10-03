import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import {
  createRepairCompletionNotice,
  getRepairCompletionNotice,
  RepairCompletionNoticeInputError,
  RepairCompletionNoticeNotFoundError,
  RepairCompletionNoticeUnavailableError,
} from "@/lib/repair-completion-notice";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function authorized() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;
  return Boolean(await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } }));
}

function repairId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function failure(error: unknown) {
  if (error instanceof RepairCompletionNoticeInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof RepairCompletionNoticeNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof RepairCompletionNoticeUnavailableError || error instanceof LineManagerSendOutboxError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error("Repair completion notice error", error);
  return NextResponse.json({ error: "Completion notice could not be processed" }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  if (!await authorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = repairId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid Repair ID" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...await getRepairCompletionNotice(prisma, id) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Context) {
  if (!await authorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = repairId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid Repair ID" }, { status: 400 });
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, notice: await createRepairCompletionNotice(prisma, id, body) });
  } catch (error) { return failure(error); }
}
