import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issuePhysicalTag, parsePhysicalTagIssue, physicalTagIssueFailure } from "@/lib/physical-tag-issue";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const admin = await prisma.admin.findUnique({
    where: { email: session.user.email }, select: { id: true },
  });
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });

  let input;
  try {
    input = parsePhysicalTagIssue(await request.json());
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  try {
    return NextResponse.json(await issuePhysicalTag(prisma, input, admin.id));
  } catch (error) {
    const failure = physicalTagIssueFailure(error);
    if (failure.status === 500) console.error("PhysicalTag issue failed");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
