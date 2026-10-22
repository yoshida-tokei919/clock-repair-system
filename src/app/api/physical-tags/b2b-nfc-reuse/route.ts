import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseB2bNfcReuseInput, preflightB2bNfcReuse, reuseB2bNfcTag } from "@/lib/b2b-nfc-reuse";
import { physicalTagNfcBindFailure } from "@/lib/physical-tag-nfc-bind";

export const dynamic = "force-dynamic";

async function handle(request: Request, confirm: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const input = parseB2bNfcReuseInput(await request.json(), confirm);
    const result = confirm
      ? await reuseB2bNfcTag(prisma, input as typeof input & { reusableTagId: number }, admin.id)
      : await preflightB2bNfcReuse(prisma, input);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = physicalTagNfcBindFailure(error);
    if (failure.status === 500) console.error("B2B NFC reuse failed");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: Request) { return handle(request, false); }
export async function PUT(request: Request) { return handle(request, true); }
