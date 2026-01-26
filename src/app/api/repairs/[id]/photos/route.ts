
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        const { url, fileName, category } = body;

        // Verify Repair exists
        const repair = await prisma.repair.findUnique({ where: { id: repairId } });
        if (!repair) return NextResponse.json({ error: "Repair not found" }, { status: 404 });

        // Create Photo Record
        const photo = await prisma.repairPhoto.create({
            data: {
                repairId: repair.id,
                category: category || 'general',
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
