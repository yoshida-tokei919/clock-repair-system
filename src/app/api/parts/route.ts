import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/parts?type=internal|external
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // 'internal' | 'external'

    try {
        const where: any = {};
        if (type) {
            where.category = type;
        }

        const parts = await prisma.partsMaster.findMany({
            where,
            orderBy: [
                { brand: { name: 'asc' } },
                { name: 'asc' }
            ],
            include: {
                brand: true,
                caliber: true,
                model: true
            }
        });

        // Map to Frontend Interface
        const mapped = (parts as any[]).map(p => ({
            id: String(p.id),
            type: p.category,
            brand: p.brand?.name || "Generic",
            brandId: p.brandId,
            model: p.model?.nameJp || "",
            modelId: p.modelId,
            targetId: p.category === 'internal' ? p.caliber?.name : (p.model?.nameJp || p.nameEn),
            name: p.name,
            ref: p.partNumber || "",
            costPrice: p.latestCostYen,
            retailPrice: p.retailPrice,
            stock: p.stockQuantity,
            supplier: p.supplier || "",
            notes: p.notes || "",
            photoKey: p.photoKey || null
        }));

        return NextResponse.json(mapped);
    } catch (error) {
        console.error("Error fetching parts:", error);
        return NextResponse.json({ error: "Failed to fetch parts" }, { status: 500 });
    }
}

// POST /api/parts (Upsert)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log("Parts API POST Received:", body);

        const {
            type, // internal/external
            brandName,
            modelName,
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
        if (!type || !name) {
            console.error("Validation Failed: Missing type or name");
            return NextResponse.json(
                { error: "Type and Name are required." },
                { status: 400 }
            );
        }

        // Upsert Brand (Optional)
        let bId = null;
        if (brandName && typeof brandName === 'string' && brandName.trim() !== "") {
            try {
                const b = await prisma.brand.upsert({
                    where: { name: brandName },
                    create: { name: brandName, nameJp: brandName },
                    update: {}
                });
                bId = b.id;
            } catch (e) {
                console.error("Brand Upsert Error (Continuing):", e);
            }
        }

        // Upsert Model (Optional)
        let mId = null;
        if (modelName && bId) {
            try {
                const m = await prisma.model.findFirst({ where: { nameJp: modelName, brandId: bId } });
                if (m) mId = m.id;
                else {
                    const newM = await prisma.model.create({ data: { name: modelName, nameJp: modelName, brandId: bId } });
                    mId = newM.id;
                }
            } catch (e) {
                console.error("Model Upsert Error (Continuing):", e);
            }
        }

        // Upsert Caliber (if internal) - Optional
        let cId = null;
        if (type === 'internal' && caliberName && typeof caliberName === 'string' && caliberName.trim() !== "") {
            try {
                const c = await prisma.caliber.findFirst({ where: { name: caliberName } });
                if (c) {
                    cId = c.id;
                } else {
                    const newC = await prisma.caliber.create({
                        data: { name: caliberName, brandId: bId }
                    });
                    cId = newC.id;
                }
            } catch (e) {
                console.error("Caliber Upsert Error (Continuing):", e);
            }
        }

        // Create Part
        const part = await prisma.partsMaster.create({
            data: {
                category: type,
                brandId: bId,
                modelId: mId,
                caliberId: cId,
                name: name,
                nameJp: name, // Required field
                nameEn: name, // Optional but good to fill
                partNumber: ref || "", // Allow empty ref
                latestCostYen: costPrice || 0,
                retailPrice: retailPrice || 0,
                stockQuantity: stock || 0,
                supplier: supplier || "",
                notes: notes || "",
                photoKey: photoKey || null,
            }
        });

        console.log("Part Created Successfully:", part.id);
        return NextResponse.json(part);

    } catch (error: any) {
        console.error("Error creating part:", error);
        return NextResponse.json(
            { error: "Failed to create part", details: error.message },
            { status: 500 }
        );
    }
}
