import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  applyPhysicalTagAction, parsePhysicalTagAction, physicalTagLifecycleFailure,
  type PhysicalTagAction,
} from "@/lib/physical-tag-lifecycle";

export async function handlePhysicalTagAction(request: Request, action: PhysicalTagAction) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  let input;
  try {
    input = parsePhysicalTagAction(action, await request.json());
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  try {
    const admin = await prisma.admin.findUnique({
      where: { email: session.user.email }, select: { id: true },
    });
    if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
    return NextResponse.json(await applyPhysicalTagAction(prisma, input, admin.id));
  } catch (error) {
    const failure = physicalTagLifecycleFailure(error);
    if (failure.status === 500) console.error("PhysicalTag lifecycle failed");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
