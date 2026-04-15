import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    const id = parseInt(params.id);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const warranty = await prisma.warranty.findUnique({
        where: { id },
        include: {
            repairs: {
                include: {
                    watch: { include: { brand: true, model: true, reference: true } },
                    estimate: { include: { items: true } },
                },
                take: 1,
            },
        },
    });

    if (!warranty) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const repair = warranty.repairs[0];
    const workSummary = repair?.workSummary || "修理一式";
    const brand = repair?.watch.brand?.nameJp || repair?.watch.brand?.name || "";
    const model = repair?.watch.model?.name || "";
    const ref = repair?.watch.reference?.name || "";
    const serial = repair?.watch.serialNumber || "";

    return NextResponse.json({
        warrantyNumber: warranty.warrantyNumber,
        issueDate: warranty.issuedDate.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }),
        guaranteeStart: warranty.guaranteeStart.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }),
        guaranteeEnd: warranty.guaranteeEnd.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }),
        watch: { brand, model, ref, serial },
        repairSummary: workSummary,
    });
}
