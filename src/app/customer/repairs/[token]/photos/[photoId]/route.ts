import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRepairPhotoSignedReadUrl, isR2RepairPhotoKey } from "@/lib/r2-repair-photos";

export async function GET(_: Request, { params }: { params: { token: string; photoId: string } }) {
  const photoId = Number(params.photoId);
  if (!params.token || !Number.isInteger(photoId) || photoId <= 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const photo = await prisma.repairPhoto.findFirst({
    where: {
      id: photoId,
      customerVisible: true,
      repair: {
        OR: [
          { publicToken: params.token },
          { estimateDocument: { publicToken: params.token } },
        ],
      },
    },
    select: { storageKey: true },
  });
  if (!photo || !isR2RepairPhotoKey(photo.storageKey)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(await getRepairPhotoSignedReadUrl(photo.storageKey));
}
