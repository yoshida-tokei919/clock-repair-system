import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { getRepairPhotoSignedReadUrl, isR2PublicCasePhotoKey } from "@/lib/r2-repair-photos";

export async function GET(_: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const imageId = Number((await params).imageId);
  if (!Number.isInteger(imageId) || imageId <= 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const image = await prisma.publicCaseImage.findUnique({
    where: { id: imageId },
    select: { storagePath: true, url: true, publicCase: { select: { b2cPublishStatus: true, reviewStatus: true } } },
  });
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isPublic = image.publicCase.b2cPublishStatus === "PUBLISHED" && image.publicCase.reviewStatus === "APPROVED";
  if (!isPublic) {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;
  }
  if (isR2PublicCasePhotoKey(image.storagePath)) return NextResponse.redirect(await getRepairPhotoSignedReadUrl(image.storagePath));
  if (image.url && /^https?:|^data:/i.test(image.url)) return NextResponse.redirect(image.url);
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
