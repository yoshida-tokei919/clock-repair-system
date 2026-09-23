import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInquiryFileSignedReadUrl, isR2InquiryFileKey } from "@/lib/r2-inquiry-files";

function positiveSafeId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_: Request, { params }: { params: { id: string; fileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inquiryId = positiveSafeId(params.id);
  const fileId = positiveSafeId(params.fileId);
  if (!inquiryId || !fileId) return NextResponse.json({ error: "Invalid file" }, { status: 400 });

  try {
    const file = await prisma.inquiryFile.findFirst({
      where: { id: fileId, inquiryId },
      select: { id: true, objectKey: true, uploadStatus: true, mimeType: true },
    });

    if (!file || file.uploadStatus !== "STORED" || !isR2InquiryFileKey(file.objectKey)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const signedUrl = await getInquiryFileSignedReadUrl(file.objectKey, 300);
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error("Inquiry LINE file read error", error);
    return NextResponse.json({ error: "画像を表示できませんでした。" }, { status: 500 });
  }
}
