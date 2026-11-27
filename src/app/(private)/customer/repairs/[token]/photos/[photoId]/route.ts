import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCustomerRepairShareScope } from "@/lib/customer-repair-share";
import { isCustomerRepairPhotoShown } from "@/lib/customer-repair-photos";
import { getRepairPhotoSignedReadUrl, isR2RepairPhotoKey } from "@/lib/r2-repair-photos";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(_: Request, { params }: { params: Promise<{ token: string; photoId: string }> }) {
  const { token, photoId: rawPhotoId } = await params;
  const photoId = Number(rawPhotoId);
  if (!token?.trim() || !Number.isInteger(photoId) || photoId <= 0) return notFound();

  const photo = await prisma.repairPhoto.findUnique({ where: { id: photoId }, select: { repairId: true, storageKey: true } });
  if (!photo || !isR2RepairPhotoKey(photo.storageKey)) return notFound();

  // Match the page's document-token precedence and its exact repair scope.
  const document = await prisma.estimateDocument.findUnique({ where: { publicToken: token }, select: { id: true, customerId: true } });
  if (document) {
    const linked = await prisma.repair.findFirst({ where: { id: photo.repairId, customerId: document.customerId, estimateDocumentId: document.id }, select: { id: true } });
    if (!linked) return notFound();
  } else {
    const scope = await resolveCustomerRepairShareScope(prisma, token);
    if (!scope || !scope.repairIds.includes(photo.repairId)) return notFound();
  }

  const repair = await prisma.repair.findUnique({ where: { id: photo.repairId }, select: {
    status: true, customer: { select: { type: true } },
    photos: { where: { customerVisible: true }, orderBy: { id: "asc" }, select: { id: true, stage: true, category: true, customerVisible: true } },
  } });
  // The B2B share page has no customer photo UI; its tokens must not grant photo access.
  if (!repair || repair.customer.type !== "individual" || !isCustomerRepairPhotoShown(repair.status, repair.photos, photoId)) return notFound();
  return NextResponse.redirect(await getRepairPhotoSignedReadUrl(photo.storageKey));
}
