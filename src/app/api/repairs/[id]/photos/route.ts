
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
