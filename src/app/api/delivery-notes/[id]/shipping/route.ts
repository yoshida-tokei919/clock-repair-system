import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { canEditDeliveryShipping, validateDeliveryShipping, type DeliveryShippingInput } from "@/lib/delivery-shipping";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid delivery note id" }, { status: 400 });
  let shipping;
  try { shipping = validateDeliveryShipping(await request.json() as DeliveryShippingInput); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "送料を確認してください" }, { status: 400 }); }
  try {
    await prisma.$transaction(async tx => {
      const [note] = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "DeliveryNote" WHERE "id" = ${id} FOR UPDATE`;
      if (!note) throw new Error("納品書が見つかりません");
      const historical = await tx.invoiceRepairSnapshot.count({ where: { deliveryNoteId: id } });
      const linked = await tx.repair.count({ where: { deliveryNoteId: id, invoiceId: { not: null } } });
      if (!canEditDeliveryShipping(historical > 0, linked > 0)) throw new Error("請求履歴のある納品書の送料は変更できません");
      await tx.deliveryNote.update({ where: { id }, data: shipping });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "変更に失敗しました" }, { status: 409 });
  }
}
