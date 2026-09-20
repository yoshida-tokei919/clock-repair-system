import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { createInquiryRepairIntakeInvite, RepairIntakeError } from "@/lib/repair-intake";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const inquiryId = Number(params.id);
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) return NextResponse.json({ error: "お問い合わせ番号が不正です。" }, { status: 400 });
  try {
    const { invite, reused } = await createInquiryRepairIntakeInvite(inquiryId);
    return NextResponse.json({ ok: true, token: invite.token, expiresAt: invite.expiresAt, reused });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RepairIntakeError ? error.message : "受付リンクを発行できませんでした。" }, { status: 400 });
  }
}
