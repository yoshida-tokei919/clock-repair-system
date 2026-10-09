import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { InquiryWatchDecision } from "@prisma/client";

import { reconcileInquiryClosure, reconcileInquiryRepairIntakeInvites } from "@/lib/inquiry-lifecycle";
import { lockLineUserInquiryTransaction } from "@/lib/inquiry-transaction-lock";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const inquiryId = Number((await params).id);
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
