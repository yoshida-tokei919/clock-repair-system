import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { photoSharingFallbacks, repairPhotoCategory, repairPhotoStage } from "@/lib/repair-photo-sharing";
import { deleteRepairPhotoObject, uploadRepairPhotoObject } from "@/lib/r2-repair-photos";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file = data.get("file");
    const repairId = Number(data.get("repairId"));
    const category = repairPhotoCategory(data.get("category"));
    const stage = repairPhotoStage(data.get("stage"));
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    if (!Number.isInteger(repairId) || repairId <= 0) return NextResponse.json({ success: false, error: "Repair ID is required" }, { status: 400 });
    if (!allowedImageTypes.has(file.type)) return NextResponse.json({ success: false, error: "Unsupported image type" }, { status: 400 });
    const [repair, preset] = await Promise.all([
      prisma.repair.findUnique({ where: { id: repairId }, select: { photoPostingOptOut: true } }),
      prisma.photoSharingDefault.findUnique({ where: { category } }),
    ]);
    if (!repair) return NextResponse.json({ success: false, error: "Repair not found" }, { status: 404 });
    const sharing = preset ?? photoSharingFallbacks[category];

    const storageKey = await uploadRepairPhotoObject({ repairId, body: Buffer.from(await file.arrayBuffer()), contentType: file.type });
    try {
      const photo = await prisma.repairPhoto.create({ data: {
        repairId, stage, category, storageKey, fileName: file.name || null, mimeType: file.type,
        customerVisible: sharing.customerVisible,
        publicCaseVisible: repair.photoPostingOptOut ? false : sharing.publicCaseVisible,
        snsVisible: repair.photoPostingOptOut ? false : sharing.snsVisible,
      } });
      return NextResponse.json({ success: true, photo, storageKey, fileName: file.name, mimeType: file.type });
    } catch (error) {
      await deleteRepairPhotoObject(storageKey).catch((cleanupError) => console.error("R2 upload rollback failed", cleanupError));
      console.error("DB Save failed for repairPhoto", { repairId, category, stage, error });
      return NextResponse.json({ success: false, error: "Database save failed" }, { status: 500 });
    }
  } catch (error) {
    console.error("Repair photo upload failed", error);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
