import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT /api/parts/[id] (Update)
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = parseInt(params.id);
        const body = await request.json();

        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const {
            type,
            brandName,
            modelName, // Not used directly in schema yet but kept for consistency
            caliberName,
            name,
            ref,
            costPrice,
            retailPrice,
            stock,
            supplier,
            notes,
            photoKey
        } = body;

        // Validation
        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        // Logic for updating Brand/Caliber if changed matches POST logic
        // For simplicity, we might just update the scalar fields unless user really wants to move a part to another brand.
        // Let's support Brand update if provided.
        let bId = undefined;
        if (brandName && typeof brandName === 'string' && brandName.trim() !== "") {
            // Check if brand exists or create? Reuse upsert logic from POST?
            try {
                const b = await prisma.brand.upsert({
                    where: { name: brandName },
                    create: { name: brandName, nameJp: brandName },
                    update: {}
                });
                bId = b.id;
            } catch (e) {
                console.error("Brand Upsert Error:", e);
            }
        }

        let mId = undefined;
        if (modelName && bId) {
            try {
                const m = await prisma.model.findFirst({ where: { nameJp: modelName, brandId: bId } });
                if (m) mId = m.id;
                else {
                    const newM = await prisma.model.create({ data: { name: modelName, nameJp: modelName, brandId: bId } });
                    mId = newM.id;
                }
            } catch (e) {
                console.error("Model Upsert Error:", e);
            }
        }

        let cId = undefined;
        if (type === 'internal' && caliberName && typeof caliberName === 'string' && caliberName.trim() !== "") {
            try {
                const c = await prisma.caliber.findFirst({ where: { name: caliberName } });
                if (c) {
                    cId = c.id;
                } else {
                    const newC = await prisma.caliber.create({
                        data: { name: caliberName, brandId: bId } // Use new bId if available
                    });
                    cId = newC.id;
                }
            } catch (e) {
                console.error("Caliber Upsert Error:", e);
            }
        }

        const updatedPart = await prisma.partsMaster.update({
            where: { id },
            data: {
                category: type,
                brandId: bId,
                modelId: mId,
                caliberId: cId,
                name: name,
                nameJp: name,
                // nameEn?
                partNumber: ref || "",
                latestCostYen: costPrice || 0,
                retailPrice: retailPrice || 0,
                stockQuantity: stock || 0,
                supplier: supplier || "",
                notes: notes || "",
                photoKey: photoKey
            }
        });

        return NextResponse.json(updatedPart);

    } catch (error) {
        console.error("Error updating part:", error);
        return NextResponse.json({ error: "Failed to update part" }, { status: 500 });
    }
}

// DELETE /api/parts/[id]
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = parseInt(params.id);
        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        await prisma.partsMaster.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting part:", error);
        return NextResponse.json({ error: "Failed to delete part" }, { status: 500 });
    }
}
