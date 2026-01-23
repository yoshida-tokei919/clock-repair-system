import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/masters/pricing
export async function GET(request: Request) {
    try {
        const rules = await prisma.pricingRule.findMany();

        // Since relations aren't explicitly defined in Prisma for PricingRule (only IDs), 
        // we'll fetch brands/models/calibers separately or just return IDs and let FE handle it (if mock logic is used).
        // But for better UX, let's fetch names.
        const brands = await prisma.brand.findMany();
        const models = await prisma.model.findMany();
        const calibers = await prisma.caliber.findMany();

        const mapped = rules.map(r => {
            const brand = brands.find(b => b.id === r.brandId);
            const model = models.find(m => m.id === r.modelId);
            const caliber = calibers.find(c => c.id === r.caliberId);

            return {
                id: String(r.id),
                brandName: brand?.name || "",
                modelName: model?.nameJp || "",
                caliberName: caliber?.name || "",
                workName: r.suggestedWorkName,
                minPrice: r.minPrice,
                maxPrice: r.maxPrice,
                customerType: r.customerType,
                notes: r.notes || ""
            };
        });

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
