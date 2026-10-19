import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { lockLineContactCustomers, validateLineContactSelection } from "@/lib/line-contact";
import { prisma } from "@/lib/prisma";

const parseId = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "顧客IDが不正です。" }, { status: 400 });
  const source = await prisma.customer.findUnique({ where: { id }, select: { type: true, lineContactCustomerId: true } });
  if (!source || source.type !== "business") return NextResponse.json({ error: "法人顧客が見つかりません。" }, { status: 404 });
  const options = await prisma.customer.findMany({ where: { type: "business", id: { not: id }, lineContactCustomerId: null },
    orderBy: [{ companyName: "asc" }, { id: "asc" }], select: { id: true, name: true, companyName: true, prefix: true } });
  const current = source.lineContactCustomerId === null ? null : await prisma.customer.findUnique({
    where: { id: source.lineContactCustomerId }, select: { id: true, name: true, companyName: true, prefix: true },
  });
  if (current && !options.some(option => option.id === current.id)) options.push(current);
  const contactId = source.lineContactCustomerId ?? id;
  const users = await prisma.lineUser.findMany({ where: { linkedCustomerId: contactId },
    select: { id: true, lineManagerChat: { select: { verifiedAt: true } } } });
  const lineStatus = users.length === 0 ? "未紐付け" : users.length > 1 ? "複数のLINEユーザーが紐付いています" :
    users[0].lineManagerChat?.verifiedAt ? "確認済みのLINE送信先あり" : "LINE Managerの送信先確認待ち";
  return NextResponse.json({ lineContactCustomerId: source.lineContactCustomerId, options, lineStatus });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "顧客IDが不正です。" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const selected = body?.lineContactCustomerId;
  const previous = body?.previousLineContactCustomerId;
  if (selected !== null && (!Number.isSafeInteger(selected) || selected <= 0)) return NextResponse.json({ error: "LINE連絡先IDが不正です。" }, { status: 400 });
  if (previous !== null && (!Number.isSafeInteger(previous) || previous <= 0)) return NextResponse.json({ error: "保存前のLINE連絡先IDが不正です。" }, { status: 400 });
  try {
    const saved = await prisma.$transaction(async tx => {
      const observed = await tx.customer.findUnique({ where: { id }, select: { lineContactCustomerId: true } });
      if (!observed) throw new Error("法人顧客が見つかりません。");
      const rows = await lockLineContactCustomers(tx, [id, ...(selected === null ? [] : [selected])]);
      const source = rows.get(id)!;
      if (source.lineContactCustomerId !== observed.lineContactCustomerId || source.lineContactCustomerId !== previous) {
        throw new Error("LINE連絡先設定が変更されました。再読み込みしてください。");
      }
      const target = selected === null ? null : rows.get(selected) ?? null;
      const value = validateLineContactSelection(source, selected, target);
      if (value !== null && await tx.customer.count({ where: { lineContactCustomerId: id } }) > 0) {
        throw new Error("他の法人のLINE連絡先になっている顧客には代理連絡先を設定できません。");
      }
      if (value !== source.lineContactCustomerId) {
        const pending = await tx.$queryRaw<{ pending: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM "LineManagerSendOutbox" o
            JOIN "EstimateDocument" d ON o."idempotencyKey" LIKE 'estimate-document-line:' || d."id" || ':%'
            WHERE d."customerId" = ${id} AND o."status" IN ('APPROVED', 'CLAIMED', 'PRE_SEND_FAILED', 'POST_UNCONFIRMED')
          ) OR EXISTS (
            SELECT 1 FROM "LineManagerSendOutbox" o
            JOIN "RepairCustomerMessage" m ON o."idempotencyKey" = 'b2b-repair-comment-notice:' || m."id"
            JOIN "Repair" r ON r."id" = m."repairId"
            WHERE r."customerId" = ${id} AND o."status" IN ('APPROVED', 'CLAIMED', 'PRE_SEND_FAILED', 'POST_UNCONFIRMED')
          ) AS pending`;
        if (pending.length !== 1 || pending[0].pending) throw new Error("LINE送信待ち・結果確認中の通知があるため、代理連絡先を変更できません。");
      }
      await tx.customer.update({ where: { id }, data: { lineContactCustomerId: value } });
      return value;
    });
    return NextResponse.json({ lineContactCustomerId: saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "LINE連絡先を保存できません。" }, { status: 400 });
  }
}
