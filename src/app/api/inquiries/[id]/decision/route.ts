import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { InquiryWatchDecision } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { reconcileInquiryClosure, reconcileInquiryRepairIntakeInvites } from "@/lib/inquiry-lifecycle";
import { lockLineUserInquiryTransaction } from "@/lib/inquiry-transaction-lock";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const inquiryId = Number(params.id);
  const body = await request.json().catch(() => null);
  const watchId = Number(body?.watchId);
  const decision = body?.decision;
  if (!Number.isInteger(inquiryId) || inquiryId <= 0 || !Number.isInteger(watchId) || watchId <= 0 || !Object.values(InquiryWatchDecision).includes(decision)) {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }
  const result = await prisma.$transaction(async (tx) => {
    const lockTarget = await tx.inquiry.findUnique({ where: { id: inquiryId }, select: { lineUserId: true } });
    if (!lockTarget) return "NOT_FOUND" as const;
    await lockLineUserInquiryTransaction(tx, lockTarget.lineUserId);

    const watch = await tx.inquiryWatch.findFirst({ where: { id: watchId, inquiryId }, select: { id: true, promotedAt: true, inquiry: { select: { status: true } } } });
    if (!watch) return "NOT_FOUND" as const;
    if (watch.inquiry.status === "CLOSED") return "CLOSED" as const;
    if (watch.promotedAt) return "PROMOTED" as const;
    await tx.inquiryWatch.update({ where: { id: watch.id }, data: { decision } });
    await reconcileInquiryClosure(tx, inquiryId);
    await reconcileInquiryRepairIntakeInvites(tx, inquiryId);
    return "UPDATED" as const;
  });
  if (result === "NOT_FOUND") return NextResponse.json({ error: "時計が見つかりません。" }, { status: 404 });
  if (result === "CLOSED") return NextResponse.json({ error: "完了済みのお問い合わせの受付判断は変更できません。" }, { status: 400 });
  if (result === "PROMOTED") return NextResponse.json({ error: "昇格済みの時計の受付判断は変更できません。" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
