import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Fail closed at the route boundary, before parsing input or querying business data. */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const admin = await prisma.admin.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!admin) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  return null;
}
