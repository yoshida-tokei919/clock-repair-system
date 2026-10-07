import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  postIntakeRoutingErrorStatus,
  postIntakeRoutingId,
  readPostIntakeRouting,
  upsertManualPostIntakeRouting,
} from "@/lib/post-intake-routing";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; messageId: string }> };

async function authorized() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  return Boolean(admin);
}

function failure(error: unknown, isWrite: boolean) {
  const status = postIntakeRoutingErrorStatus(error, isWrite);
  if (status === 500) console.error("Post-intake routing request failed", error);
  const messages = {
    400: "関連付け内容が不正です。",
    404: "対象メッセージが見つかりません。",
    409: "関連付けの状態が変更されました。",
    500: "関連付けを処理できませんでした。",
  };
  return NextResponse.json({ error: messages[status] }, { status });
}

export async function GET(_request: Request, { params }: Context) {
  if (!(await authorized())) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const { id, messageId } = await params;
    return NextResponse.json(await readPostIntakeRouting(prisma, postIntakeRoutingId(id), postIntakeRoutingId(messageId)));
  } catch (error) {
    return failure(error, false);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  if (!(await authorized())) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const { id, messageId } = await params;
    const customerId = postIntakeRoutingId(id);
    const savedMessageId = postIntakeRoutingId(messageId);
    const body = await request.json();
    return NextResponse.json(await upsertManualPostIntakeRouting(prisma, customerId, savedMessageId, body));
  } catch (error) {
    return failure(error, true);
  }
}
