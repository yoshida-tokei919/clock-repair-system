import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InquiryPromotionInputError, parseInquiryPromotionInput, promoteInquiryWatches } from "@/lib/inquiry-promotion";

function inquiryIdFromParams(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const inquiryId = inquiryIdFromParams(params.id);
  if (!inquiryId) return NextResponse.json({ error: "Invalid inquiry ID" }, { status: 400 });
  try {
    const input = parseInquiryPromotionInput(await request.json());
    const result = await prisma.$transaction(
      (tx) => promoteInquiryWatches(tx, { inquiryId, ...input }),
      { maxWait: 5_000, timeout: 20_000 },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof InquiryPromotionInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Inquiry promotion error", error);
    return NextResponse.json({ error: "Failed to promote Inquiry watches." }, { status: 500 });
  }
}
