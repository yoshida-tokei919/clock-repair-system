import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { lockInvoiceRecipientCustomers, validateInvoiceRecipientSelection } from "@/lib/invoice-recipient";
import { prisma } from "@/lib/prisma";

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "顧客IDが不正です。" }, { status: 400 });
  const source = await prisma.customer.findUnique({ where: { id }, select: { id: true, type: true, invoiceRecipientCustomerId: true } });
  if (!source || source.type !== "business") return NextResponse.json({ error: "法人顧客が見つかりません。" }, { status: 404 });
  const options = await prisma.customer.findMany({ where: { type: "business", id: { not: id } },
    orderBy: [{ companyName: "asc" }, { id: "asc" }],
    select: { id: true, name: true, companyName: true, prefix: true } });
  return NextResponse.json({ invoiceRecipientCustomerId: source.invoiceRecipientCustomerId, options });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "顧客IDが不正です。" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const selected = body?.invoiceRecipientCustomerId;
  if (selected !== null && (!Number.isSafeInteger(selected) || selected <= 0)) {
    return NextResponse.json({ error: "請求先IDが不正です。" }, { status: 400 });
  }
  try {
    const saved = await prisma.$transaction(async tx => {
      const observed = await tx.customer.findUnique({ where: { id }, select: { invoiceRecipientCustomerId: true } });
      if (!observed) throw new Error("法人顧客が見つかりません。");
      const locked = await lockInvoiceRecipientCustomers(tx, [id, ...(selected !== null && selected !== id ? [selected] : [])]);
      const source = locked.get(id)!;
      if (source.invoiceRecipientCustomerId !== observed.invoiceRecipientCustomerId) {
        throw new Error("請求先設定が変更されました。再読み込みしてください。");
      }
      if (source.type !== "business") throw new Error("法人顧客が見つかりません。");
      const target = selected !== null && selected !== id ? locked.get(selected) ?? null : null;
      const invoiceRecipientCustomerId = validateInvoiceRecipientSelection(source, selected, target ?? null);
      await tx.customer.update({ where: { id }, data: { invoiceRecipientCustomerId } });
      return invoiceRecipientCustomerId;
    });
    return NextResponse.json({ invoiceRecipientCustomerId: saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "請求先を保存できません。" }, { status: 400 });
  }
}
