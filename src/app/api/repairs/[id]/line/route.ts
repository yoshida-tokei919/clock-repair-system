import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { InquiryLineChatInputError, InquiryLineChatNotFoundError, InquiryLineChatUnavailableError } from "@/lib/inquiry-line-chat";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import { createRepairLineReply, getRepairLineChat } from "@/lib/repair-line-chat";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function repairId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = repairId(params.id);
  if (!id) return NextResponse.json({ error: "Invalid Repair ID" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...await getRepairLineChat(prisma, id) });
  } catch (error) {
    if (error instanceof InquiryLineChatNotFoundError) return NextResponse.json({ error: "Repairが見つかりません。" }, { status: 404 });
    console.error("Repair LINE history error", error);
    return NextResponse.json({ error: "LINE履歴を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = repairId(params.id);
  if (!id) return NextResponse.json({ error: "Invalid Repair ID" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "LINE返信内容が不正です。" }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, item: await createRepairLineReply(prisma, id, body) });
  } catch (error) {
    if (error instanceof InquiryLineChatInputError) return NextResponse.json({ error: "LINE返信内容が不正です。" }, { status: 400 });
    if (error instanceof InquiryLineChatNotFoundError) return NextResponse.json({ error: "Repairが見つかりません。" }, { status: 404 });
    if (error instanceof InquiryLineChatUnavailableError) return NextResponse.json({ error: "元のInquiryまたはLINE送信先を確認できません。" }, { status: 409 });
    if (error instanceof LineManagerSendOutboxError) return NextResponse.json({ error: "LINE送信待ちを作成できませんでした。" }, { status: 409 });
    console.error("Repair LINE reply error", error);
    return NextResponse.json({ error: "LINE送信待ちを作成できませんでした。" }, { status: 500 });
  }
}
