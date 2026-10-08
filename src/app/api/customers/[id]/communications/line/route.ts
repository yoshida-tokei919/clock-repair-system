import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { createCustomerLineReply, CustomerLineReplyNotFoundError, CustomerLineReplyUnavailableError } from "@/lib/customer-line-reply";
import { InquiryLineChatInputError } from "@/lib/inquiry-line-chat";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
