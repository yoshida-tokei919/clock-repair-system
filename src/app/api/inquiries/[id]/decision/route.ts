import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { InquiryWatchDecision } from "@prisma/client";

import { authOptions } from "@/lib/auth";
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
  const watch = await prisma.inquiryWatch.findFirst({ where: { id: watchId, inquiryId }, select: { id: true, promotedAt: true } });
  if (!watch) return NextResponse.json({ error: "時計が見つかりません。" }, { status: 404 });
  if (watch.promotedAt) return NextResponse.json({ error: "昇格済みの時計の受付判断は変更できません。" }, { status: 400 });
  await prisma.inquiryWatch.update({ where: { id: watch.id }, data: { decision } });
  return NextResponse.json({ ok: true });
}
