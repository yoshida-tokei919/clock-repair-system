import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseStorageLocationIdentifier, resolveStorageLocation } from "@/lib/storage-location-resolver";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await getServerSession(authOptions))?.user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }
  let identifier;
  try {
    identifier = parseStorageLocationIdentifier(await request.json());
  } catch {
    return NextResponse.json({ error: "識別子が不正です。" }, { status: 400 });
  }
  try {
    return NextResponse.json(await resolveStorageLocation(prisma, identifier));
  } catch {
    console.error("StorageLocation resolve failed");
    return NextResponse.json({ error: "保管場所を照合できませんでした。" }, { status: 500 });
  }
}
