import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { parseDiscountBps } from "@/lib/b2b-invoice-discount";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const setting = await prisma.b2BInvoiceDiscountSetting.findUnique({ where: { id: 1 } });
  if (!setting) return NextResponse.json({ error: "請求割引設定がありません" }, { status: 503 });
  return NextResponse.json({ standardRateBps: setting.standardRateBps });
}

export async function PATCH(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const standardRateBps = parseDiscountBps(body?.standardRateBps);
    const setting = await prisma.b2BInvoiceDiscountSetting.update({ where: { id: 1 }, data: { standardRateBps } });
    return NextResponse.json({ standardRateBps: setting.standardRateBps });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存できません" }, { status: 400 });
  }
}
