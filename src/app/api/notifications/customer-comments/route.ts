import { NextResponse } from "next/server";
import { getAdminApiIdentity } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await getAdminApiIdentity();
  if (!identity) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  const admin = await prisma.admin.findUnique({ where: { id: identity.id }, select: { role: true } });
  if (admin?.role !== "admin") return NextResponse.json({ error: "権限がありません。" }, { status: 403 });

  const where = { senderType: "partner", readAt: null };
  const [unreadCount, recent, latest] = await Promise.all([
    prisma.repairCustomerMessage.count({ where }),
    prisma.repairCustomerMessage.findMany({
      where, orderBy: { id: "desc" }, take: 20,
      select: { id: true, body: true, repairId: true, createdAt: true,
        repair: { select: { inquiryNumber: true } } },
    }),
    prisma.repairCustomerMessage.findFirst({
      where: { senderType: "partner" }, orderBy: { id: "desc" }, select: { id: true },
    }),
  ]);
  return NextResponse.json({ unreadCount, latestId: latest?.id ?? 0, recent: recent.map((message) => ({
    id: message.id, repairId: message.repairId, inquiryNumber: message.repair.inquiryNumber,
    snippet: Array.from(message.body.replace(/\s+/g, " ").trim()).slice(0, 100).join(""),
    createdAt: message.createdAt,
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
