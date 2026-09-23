import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  createInquiryLineReply,
  getInquiryLineChat,
  InquiryLineChatInputError,
  InquiryLineChatNotFoundError,
  InquiryLineChatUnavailableError,
} from "@/lib/inquiry-line-chat";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function inquiryIdFromParams(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inquiryId = inquiryIdFromParams(params.id);
  if (!inquiryId) return NextResponse.json({ error: "Invalid inquiry ID" }, { status: 400 });

  try {
    const payload = await getInquiryLineChat(prisma, inquiryId);
    if (!payload) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof InquiryLineChatInputError) {
      return NextResponse.json({ error: "LINE履歴を取得できませんでした。" }, { status: 400 });
    }
    console.error("Inquiry LINE history error", error);
    return NextResponse.json({ error: "LINE履歴を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inquiryId = inquiryIdFromParams(params.id);
  if (!inquiryId) return NextResponse.json({ error: "Invalid inquiry ID" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "LINE返信内容が不正です。" }, { status: 400 });
  }

  try {
    const item = await createInquiryLineReply(prisma, inquiryId, body);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof InquiryLineChatInputError) {
      return NextResponse.json({ error: "LINE返信内容が不正です。" }, { status: 400 });
    }
    if (error instanceof InquiryLineChatNotFoundError) {
      return NextResponse.json({ error: "Inquiryが見つかりません。" }, { status: 404 });
    }
    if (error instanceof InquiryLineChatUnavailableError) {
      return NextResponse.json({ error: "LINE送信先の確認がまだ完了していません。" }, { status: 409 });
    }
    if (error instanceof LineManagerSendOutboxError) {
      return NextResponse.json({ error: "LINE送信待ちを作成できませんでした。" }, { status: 409 });
    }
    console.error("Inquiry LINE reply error", error);
    return NextResponse.json({ error: "LINE送信待ちを作成できませんでした。" }, { status: 500 });
  }
}
