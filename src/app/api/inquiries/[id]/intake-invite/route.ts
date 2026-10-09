import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";

import { createInquiryRepairIntakeInvite, RepairIntakeError } from "@/lib/repair-intake";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const inquiryId = Number((await params).id);
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) return NextResponse.json({ error: "お問い合わせ番号が不正です。" }, { status: 400 });
  try {
    const { invite, reused } = await createInquiryRepairIntakeInvite(inquiryId);
    return NextResponse.json({ ok: true, token: invite.token, expiresAt: invite.expiresAt, reused });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RepairIntakeError ? error.message : "受付リンクを発行できませんでした。" }, { status: 400 });
  }
}
