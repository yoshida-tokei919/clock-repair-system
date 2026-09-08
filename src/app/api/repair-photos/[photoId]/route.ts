import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRepairPhotoSignedReadUrl, isR2RepairPhotoKey } from "@/lib/r2-repair-photos";

export async function GET(_: Request, { params }: { params: { photoId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.photoId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid photo ID" }, { status: 400 });
  const photo = await prisma.repairPhoto.findUnique({ where: { id }, select: { storageKey: true } });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isR2RepairPhotoKey(photo.storageKey)) return NextResponse.json({ error: "Legacy photo has no R2 object" }, { status: 404 });
  return NextResponse.redirect(await getRepairPhotoSignedReadUrl(photo.storageKey));
}
