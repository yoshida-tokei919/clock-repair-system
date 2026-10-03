import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { buildCustomerShareUrl } from "@/lib/customer-share-url";
import { prisma } from "@/lib/prisma";
import {
  getRepairCompletionNotice,
  RepairCompletionNoticeNotFoundError,
} from "@/lib/repair-completion-notice";
import {
  ensureRepairPublicToken,
  RepairPublicTokenNotFoundError,
} from "@/lib/repair-public-token";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function authorized() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;
  return Boolean(await prisma.admin.findUnique({
    where: { email: session.user.email }, select: { id: true },
  }));
}

function parseRepairId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
export async function POST(request: Request, { params }: Context) {
  if (!await authorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repairId = parseRepairId((await params).id);
  if (!repairId) return NextResponse.json({ error: "Invalid Repair ID" }, { status: 400 });

  try {
    const completion = await getRepairCompletionNotice(prisma, repairId);
    if (!completion.eligible || !completion.hasVerifiedLineDestination) {
      return NextResponse.json({ error: "この修理は作業完了LINE連絡の対象ではありません。" }, { status: 409 });
    }
    if (completion.notice) {
      return NextResponse.json({ error: "作業完了LINE連絡はすでに送信待ちへ登録されています。" }, { status: 409 });
    }
    const token = await ensureRepairPublicToken(prisma, repairId);
    const url = buildCustomerShareUrl(`/customer/delivery/${token}`, request.url);
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    if (error instanceof RepairPublicTokenNotFoundError || error instanceof RepairCompletionNoticeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Delivery preference link error", error);
    return NextResponse.json({ error: "配達希望回答URLを作成できませんでした。" }, { status: 500 });
  }
}
