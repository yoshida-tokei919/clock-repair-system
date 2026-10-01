import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parsePhysicalTagIdentifier,
  resolvePhysicalTag,
} from "@/lib/physical-tag-resolver";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await getServerSession(authOptions))?.user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  let identifier;
  try {
    identifier = parsePhysicalTagIdentifier(await request.json());
  } catch {
    return NextResponse.json({ error: "識別子が不正です。" }, { status: 400 });
  }

  try {
    return NextResponse.json(await resolvePhysicalTag(prisma, identifier));
  } catch {
    console.error("PhysicalTag resolve failed");
    return NextResponse.json(
      { error: "PhysicalTagを解決できませんでした。" },
      { status: 500 },
    );
  }
}
