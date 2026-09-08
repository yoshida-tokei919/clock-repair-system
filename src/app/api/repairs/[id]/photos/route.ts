
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    normalizePhotoSharing,
    photoSharingFallbacks,
    repairPhotoCategory,
    repairPhotoStage,
} from "@/lib/repair-photo-sharing";

// GET /api/repairs/[id]/photos
// Fetch existing photos for a repair
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const repairId = parseInt(params.id);
        if (isNaN(repairId)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const photos = await prisma.repairPhoto.findMany({
            where: { repairId: repairId },
            orderBy: { createdAt: 'asc' }
        });

        return NextResponse.json(photos);
    } catch (error) {
        console.error("Error fetching photos:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// POST /api/repairs/[id]/photos
// Register a photo record (Mock or Real URL)
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const repairId = Number(params.id);
        if (isNaN(repairId)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const body = await req.json();
        const { url, fileName } = body;
        const category = repairPhotoCategory(body.category);

        // Verify Repair exists
        const repair = await prisma.repair.findUnique({ where: { id: repairId }, select: { id: true, photoPostingOptOut: true } });
        if (!repair) return NextResponse.json({ error: "Repair not found" }, { status: 404 });

        // Create Photo Record
        const preset = await prisma.photoSharingDefault.findUnique({ where: { category } });
        const sharing = normalizePhotoSharing(preset ?? photoSharingFallbacks[category]);
        if (repair.photoPostingOptOut) {
            sharing.publicCaseVisible = false;
            sharing.snsVisible = false;
        }
        const photo = await prisma.repairPhoto.create({
            data: {
                repairId: repair.id,
                stage: repairPhotoStage(body.stage),
                category,
                ...sharing,
                storageKey: url, // In real world, this is the R2 key. In mock, it's the URL.
                fileName: fileName,
                mimeType: 'image/webp'
            }
        });

        return NextResponse.json({ success: true, data: photo });

    } catch (error) {
        console.error("Photo Register Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// PATCH /api/repairs/[id]/photos
// Update one saved photo's classification and sharing permissions.
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const repairId = Number(params.id);
        if (!Number.isInteger(repairId) || repairId <= 0) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const body = await req.json();
        const photoId = Number(body.photoId);
        if (!Number.isInteger(photoId) || photoId <= 0) {
            return NextResponse.json({ error: "Invalid photo ID" }, { status: 400 });
        }

        const category = repairPhotoCategory(body.category);
        const repair = await prisma.repair.findUnique({
            where: { id: repairId },
            select: { photoPostingOptOut: true },
        });
        if (!repair) return NextResponse.json({ error: "Repair not found" }, { status: 404 });
        const sharing = normalizePhotoSharing({
            customerVisible: body.customerVisible,
            publicCaseVisible: body.publicCaseVisible,
            snsVisible: body.snsVisible,
        });
        if (repair.photoPostingOptOut) {
            sharing.publicCaseVisible = false;
            sharing.snsVisible = false;
        }
        const photo = await prisma.repairPhoto.updateMany({
            where: { id: photoId, repairId },
            data: { stage: repairPhotoStage(body.stage), category, ...sharing },
        });
        if (photo.count !== 1) {
            return NextResponse.json({ error: "Photo not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, sharing });
    } catch (error) {
        console.error("Photo update error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
