import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT /api/masters/pricing/[id]
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = parseInt(params.id);
        const body = await request.json();
        const { brandName, modelName, caliberName, workName, minPrice, maxPrice, customerType, notes } = body;

        if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

        // Lookup IDs (Same logic as POST)
        let bId = null;
        if (brandName) {
            const b = await prisma.brand.upsert({
                where: { name: brandName },
                create: { name: brandName, nameJp: brandName },
                update: {}
            });
            bId = b.id;
        }
        let mId = null;
        if (modelName && bId) {
            const m = await prisma.model.findFirst({ where: { nameJp: modelName, brandId: bId } });
            if (m) mId = m.id;
        }
        let cId = null;
        if (caliberName) {
            const c = await prisma.caliber.findFirst({ where: { name: caliberName } });
            if (c) cId = c.id;
        }

        const updated = await prisma.pricingRule.update({
            where: { id },
            data: {
                brandId: bId,
                modelId: mId,
                caliberId: cId,
                suggestedWorkName: workName,
                minPrice: parseInt(minPrice) || 0,
                maxPrice: parseInt(maxPrice) || parseInt(minPrice) || 0,
                customerType: customerType || "individual",
                notes: notes || ""
            }
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating rule:", error);
        return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
    }
}

// DELETE /api/masters/pricing/[id]
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = parseInt(params.id);
        if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

        await prisma.pricingRule.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting rule:", error);
        return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
}
