import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api-auth";
import { assertBillingMembership, assertBusinessCustomer, assertDissolvableCompany, B2BCompanyError } from "@/lib/b2b-company";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

function parseId(value: unknown): number {
  const id = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new B2BCompanyError("IDが不正です。");
  return id;
}

export async function GET(_request: Request, { params }: Context) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const customerId = parseId((await params).id);
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, type: true } });
    if (!customer) return NextResponse.json({ error: "顧客が見つかりません。" }, { status: 404 });
    const [companies, membership] = await Promise.all([
      prisma.b2BCompany.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, billingCustomerId: true,
          members: { orderBy: { customerId: "asc" }, select: { customerId: true, customer: { select: { name: true, type: true } } } },
        },
      }),
      prisma.b2BCompanyMembership.findUnique({ where: { customerId }, select: { companyId: true } }),
    ]);
    return NextResponse.json({ customer, companies, companyId: membership?.companyId ?? null });
  } catch (error) {
    if (error instanceof B2BCompanyError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("B2B company read failed", error);
    return NextResponse.json({ error: "会社設定を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const customerId = parseId((await params).id);
    const body = await request.json();
    const action = body?.action;
    if (!["create", "join", "leave", "setBilling", "dissolve"].includes(action)) {
      throw new B2BCompanyError("操作が不正です。");
    }
    const companyId = action === "create" ? null : parseId(body.companyId);
    const billingCustomerId = action === "setBilling" ? parseId(body.billingCustomerId) : null;
    const name = action === "create" && typeof body.name === "string" ? body.name.trim() : "";
    if (action === "create" && (!name || name.length > 200)) throw new B2BCompanyError("会社名を1〜200文字で入力してください。");

    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, type: true } });
      assertBusinessCustomer(customer);

      if (action === "create") {
        const existing = await tx.b2BCompanyMembership.findUnique({ where: { customerId } });
        if (existing) throw new B2BCompanyError("この顧客は既に会社に所属しています。");
        const company = await tx.b2BCompany.create({ data: { name } });
        await tx.b2BCompanyMembership.create({ data: { companyId: company.id, customerId } });
        await tx.b2BCompany.update({ where: { id: company.id }, data: { billingCustomerId: customerId } });
        return;
      }

      // Serialize membership and destination edits for this company.
      const rows = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM public."B2BCompany" WHERE "id" = ${companyId} FOR UPDATE
      `;
      if (rows.length !== 1) throw new B2BCompanyError("会社が見つかりません。");
      if (action === "join") {
        const existing = await tx.b2BCompanyMembership.findUnique({ where: { customerId } });
        if (existing) throw new B2BCompanyError("この顧客は既に会社に所属しています。");
        await tx.b2BCompanyMembership.create({ data: { companyId: companyId!, customerId } });
        return;
      }

      const ownMembership = await tx.b2BCompanyMembership.findUnique({ where: { customerId } });
      if (ownMembership?.companyId !== companyId) throw new B2BCompanyError("この顧客は指定会社に所属していません。");
      if (action === "dissolve") {
        const company = await tx.b2BCompany.findUnique({ where: { id: companyId! }, select: { billingCustomerId: true } });
        const members = await tx.b2BCompanyMembership.findMany({ where: { companyId: companyId! }, select: { customerId: true } });
        assertDissolvableCompany(customerId, company, members);
        const cleared = await tx.b2BCompany.updateMany({
          where: { id: companyId!, billingCustomerId: customerId }, data: { billingCustomerId: null },
        });
        if (cleared.count !== 1) throw new B2BCompanyError("会社の請求先が変更されました。再読み込みして確認してください。");
        await tx.b2BCompanyMembership.delete({ where: { companyId_customerId: { companyId: companyId!, customerId } } });
        await tx.b2BCompany.delete({ where: { id: companyId! } });
        return;
      }
      if (action === "leave") {
        const company = await tx.b2BCompany.findUniqueOrThrow({ where: { id: companyId! }, select: { billingCustomerId: true } });
        if (company.billingCustomerId === customerId) throw new B2BCompanyError("請求先店舗を変更してから所属を解除してください。");
        await tx.b2BCompanyMembership.delete({ where: { customerId } });
        return;
      }

      const member = await tx.b2BCompanyMembership.findUnique({
        where: { customerId: billingCustomerId! },
        include: { customer: { select: { id: true, type: true } } },
      });
      assertBillingMembership(companyId!, member);
      await tx.b2BCompany.update({ where: { id: companyId! }, data: { billingCustomerId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof B2BCompanyError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2014"].includes(error.code)) {
      return NextResponse.json({ error: "所属または請求先の状態が変わりました。再読み込みして確認してください。" }, { status: 409 });
    }
    console.error("B2B company update failed", error);
    return NextResponse.json({ error: "会社設定を保存できませんでした。" }, { status: 500 });
  }
}
