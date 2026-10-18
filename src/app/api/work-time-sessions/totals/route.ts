import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { cardKey, parseCards, sumCompletedSeconds } from "@/lib/work-timer-cards";

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const body: unknown = await request.json().catch(() => null);
  const cards = parseCards(body);
  if (!Array.isArray(body) || body.length > 30 || cards.length !== body.length)
    return NextResponse.json({ error: "Invalid timer cards." }, { status: 400 });
  const totals: Record<string, number> = Object.fromEntries(cards.map(card => [card.key, 0]));
  if (!cards.length) return NextResponse.json({ totals });
  const rows = await prisma.workTimeSession.findMany({
    where: { invalidatedAt: null, endedAt: { not: null }, OR: cards.map(({ input }) => ({
      activityType: input.activityType, repairId: input.repairId ?? null,
      inquiryId: input.inquiryId ?? null, orderRequestId: input.orderRequestId ?? null,
      workLabelSnapshot: input.label?.trim() || null,
    })) },
    select: { activityType: true, repairId: true, inquiryId: true, orderRequestId: true,
      workLabelSnapshot: true, startedAt: true, endedAt: true, invalidatedAt: true },
  });
  for (const row of rows) {
    const key = cardKey({ activityType: row.activityType, repairId: row.repairId ?? undefined,
      inquiryId: row.inquiryId ?? undefined, orderRequestId: row.orderRequestId ?? undefined,
      label: row.workLabelSnapshot ?? undefined });
    if (key in totals) totals[key] += sumCompletedSeconds([row]);
  }
  return NextResponse.json({ totals });
}
