import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { getRecentRepairComments, getRepairCommentAccess } from "@/lib/repair-comments";

type Context = { params: Promise<{ id: string }> };

async function authorizedRepair(context: Context) {
  return getRepairCommentAccess((await context.params).id, requireAdminApi, async (repairId) =>
    Boolean(await prisma.repair.findUnique({ where: { id: repairId }, select: { id: true } })));
}

export async function GET(_request: Request, context: Context) {
  const { response, repairId } = await authorizedRepair(context);
  if (response || repairId === null) return response;
  const messages = await getRecentRepairComments(repairId, (query) => prisma.repairCustomerMessage.findMany({
    where: query.where, orderBy: query.orderBy, take: query.take,
    select: { id: true, body: true, senderType: true, createdAt: true, readAt: true },
  }));
  return NextResponse.json({ messages });
}

export async function POST(request: Request, context: Context) {
  const { response, repairId } = await authorizedRepair(context);
  if (response || repairId === null) return response;
  const input = await request.json().catch(() => null);
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!body || body.length > 500) return NextResponse.json({ error: "コメントは1～500文字で入力してください。" }, { status: 400 });
  const message = await prisma.repairCustomerMessage.create({
    data: { repairId, body, senderType: "shop", readAt: new Date() },
    select: { id: true, body: true, senderType: true, createdAt: true, readAt: true },
  });
  return NextResponse.json({ message }, { status: 201 });
}
