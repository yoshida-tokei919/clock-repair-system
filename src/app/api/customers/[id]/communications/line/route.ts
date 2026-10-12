import { requireAdminApi } from "@/lib/admin-api-auth";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { createCustomerLineReply, CustomerLineReplyNotFoundError, CustomerLineReplyUnavailableError } from "@/lib/customer-line-reply";
import { InquiryLineChatInputError } from "@/lib/inquiry-line-chat";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import { prisma } from "@/lib/prisma";
import { getCustomerCommunicationHub } from "@/lib/customer-communication-hub";
import { getLatestCommunicationAiBrief, resolveCustomerCommunicationAiContext } from "@/lib/communication-ai-brief";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const rawCustomerId = (await params).id;
  const customerId = Number(rawCustomerId);
  if (!/^[1-9]\d*$/.test(rawCustomerId) || !Number.isSafeInteger(customerId)) {
    return NextResponse.json({ error: "顧客IDが不正です。" }, { status: 400 });
  }
  try {
    const hub = await getCustomerCommunicationHub(prisma, customerId);
    if (!hub) return NextResponse.json({ error: "顧客が見つかりません。" }, { status: 404 });
    const context = resolveCustomerCommunicationAiContext(customerId, hub);
    const aiBrief = await getLatestCommunicationAiBrief(prisma, { targetType: "CUSTOMER", targetId: customerId }, context);
    return NextResponse.json({ ok: true, aiBrief: aiBrief ? {
      id: aiBrief.id, replyDraft: aiBrief.replyDraft, stale: aiBrief.stale,
    } : null, replyDraftAllowed: context.replyDraftAllowed });
  } catch (error) {
    console.error("Customer LINE AI freshness error", error);
    return NextResponse.json({ error: "AI返信案の最新状態を確認できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const rawCustomerId = (await params).id;
  const customerId = Number(rawCustomerId);
  if (!/^[1-9]\d*$/.test(rawCustomerId) || !Number.isSafeInteger(customerId)) {
    return NextResponse.json({ error: "顧客IDが不正です。" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "LINE返信内容が不正です。" }, { status: 400 });
  }
  try {
    const item = await createCustomerLineReply(prisma, customerId, body);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof InquiryLineChatInputError) return NextResponse.json({ error: "LINE返信内容が不正です。" }, { status: 400 });
    if (error instanceof CustomerLineReplyNotFoundError) return NextResponse.json({ error: "顧客またはLINEユーザーが見つかりません。" }, { status: 404 });
    if (error instanceof CustomerLineReplyUnavailableError || error instanceof LineManagerSendOutboxError ||
        (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code))) {
      return NextResponse.json({ error: "LINE送信先または会話を確認できません。画面を更新してください。" }, { status: 409 });
    }
    console.error("Customer LINE reply error", error);
    return NextResponse.json({ error: "LINE送信待ちを作成できませんでした。" }, { status: 500 });
  }
}
