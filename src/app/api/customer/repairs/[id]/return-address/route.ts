import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { parseReturnAddress, returnAddressData } from "@/lib/return-address";
import { findRepairIdByIdOrToken } from "../_workflow";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const repairId = await findRepairIdByIdOrToken(params.id);
  if (!repairId) return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });

  let address;
  try {
    address = parseReturnAddress(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "返送先の入力内容が正しくありません。" }, { status: 400 });
  }

  const repair = await prisma.repair.findUnique({
    where: { id: repairId },
    select: { id: true, approvalStatus: true, customer: { select: { type: true } } },
  });
  if (!repair) return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  if (repair.customer.type !== "individual") return NextResponse.json({ error: "返送先はB2C案件でのみ変更できます。" }, { status: 403 });
  if (repair.approvalStatus !== "pending") return NextResponse.json({ error: "承認後は返送先を変更できません。" }, { status: 409 });

  const updated = await prisma.repair.update({
    where: { id: repair.id },
    data: returnAddressData(address),
  });
  return NextResponse.json({ success: true, repair: updated });
}
