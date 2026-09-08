import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { enforceRepairPhotoPostingOptOut } from "@/lib/repair-photo-posting-opt-out";

// App-side repair management endpoint. The customer endpoint has the same
// enforcement rule, but resolves a customer-facing token rather than a repair ID.
export async function POST(request: Request, { params }: { params: { id: string } }) {
    const repairId = Number(params.id);
    if (!Number.isInteger(repairId) || repairId <= 0) {
        return NextResponse.json({ error: "Invalid repair ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.photoPostingOptOut !== "boolean") {
        return NextResponse.json({ error: "photoPostingOptOut must be boolean" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
        const repair = await tx.repair.findUnique({ where: { id: repairId }, select: { id: true } });
        if (!repair) return false;

        await tx.repair.update({
            where: { id: repairId },
            data: { photoPostingOptOut: body.photoPostingOptOut },
        });
        await enforceRepairPhotoPostingOptOut(tx, repairId, body.photoPostingOptOut);
        return true;
    });

    if (!updated) return NextResponse.json({ error: "Repair not found" }, { status: 404 });
    return NextResponse.json({ success: true, photoPostingOptOut: body.photoPostingOptOut });
}
