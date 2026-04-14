import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/invoices/preview?customerId=1&month=2026-03
// 指定取引先・月の納品済み未請求修理一覧を返す
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const customerId = parseInt(searchParams.get("customerId") || "");
    const month = searchParams.get("month"); // "YYYY-MM"

    if (!customerId || !month) {
        return NextResponse.json({ error: "customerId と month を指定してください" }, { status: 400 });
    }

    const [year, mon] = month.split("-").map(Number);
    const from = new Date(year, mon - 1, 1);
    const to = new Date(year, mon, 1); // 翌月1日（exclusive）

    const repairs = await prisma.repair.findMany({
        where: {
            customerId,
            invoiceId: null, // 未請求
            deliveryDateActual: { gte: from, lt: to }, // 当月納品済み
        },
        include: {
            watch: { include: { brand: true, model: true, reference: true } },
            estimate: { include: { items: true } },
            deliveryNote: { select: { slipNumber: true } },
        },
        orderBy: { deliveryDateActual: "asc" },
    });

    const result = repairs.map((r) => {
        const subtotal = (r.estimate?.items || []).reduce(
            (s, i) => s + i.unitPrice * i.quantity,
            0
        );
        return {
            id: r.id,
            inquiryNumber: r.inquiryNumber,
            partnerRef: r.partnerRef,
            endUserName: r.endUserName,
            deliveryDate: r.deliveryDateActual?.toISOString(),
            slipNumber: r.deliveryNote?.slipNumber || r.inquiryNumber,
            watch: {
                brand: r.watch.brand?.nameJp || r.watch.brand?.name || "",
                model: r.watch.model?.name || "",
                ref: r.watch.reference?.name || "",
            },
            subtotal,
        };
    });

    return NextResponse.json(result);
}
