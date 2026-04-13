import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/masters/pricing
export async function GET(request: Request) {
    try {
        // 4クエリを並列実行 + Mapでルックアップをすべてо(1)に
        const [rules, brands, models, calibers] = await Promise.all([
            prisma.pricingRule.findMany(),
            prisma.brand.findMany({ select: { id: true, name: true } }),
            prisma.model.findMany({ select: { id: true, name: true, nameJp: true } }),
            prisma.caliber.findMany({ select: { id: true, name: true } }),
        ]);

        const brandMap = new Map(brands.map(b => [b.id, b.name]));
        const modelMap = new Map(models.map(m => [m.id, m.nameJp || m.name]));
        const caliberMap = new Map(calibers.map(c => [c.id, c.name]));

        const mapped = rules.map(r => ({
            id: String(r.id),
            brandName: brandMap.get(r.brandId ?? -1) ?? "",
            modelName: modelMap.get(r.modelId ?? -1) ?? "",
            caliberName: caliberMap.get(r.caliberId ?? -1) ?? "",
            workName: r.suggestedWorkName,
            minPrice: r.minPrice,
            maxPrice: r.maxPrice,
            customerType: r.customerType,
            notes: r.notes || ""
        }));

        return NextResponse.json(mapped);
    } catch (error) {
        console.error("Error fetching rules:", error);
        return NextResponse.json({ error: "Failed to fetch pricing rules" }, { status: 500 });
    }
}

// POST /api/masters/pricing
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { brandName, modelName, caliberName, workName, minPrice, maxPrice, customerType, notes } = body;

        if (!workName) return NextResponse.json({ error: "Work Name is required" }, { status: 400 });

        // Lookup IDs
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
            else {
                const newM = await prisma.model.create({ data: { name: modelName, nameJp: modelName, brandId: bId } });
                mId = newM.id;
            }
        }

        let cId = null;
        if (caliberName) {
            const c = await prisma.caliber.findFirst({ where: { name: caliberName } });
            if (c) cId = c.id;
            else {
                const newC = await prisma.caliber.create({ data: { name: caliberName, brandId: bId } });
                cId = newC.id;
            }
        }

        const rule = await prisma.pricingRule.create({
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

        return NextResponse.json(rule);
    } catch (error) {
        console.error("Error creating rule:", error);
        return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
    }
}
