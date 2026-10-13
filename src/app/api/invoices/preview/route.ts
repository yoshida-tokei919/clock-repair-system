import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billingMonthBounds, parseBillingMonth } from "@/lib/b2b-billing-month";

// GET /api/invoices/preview?customerId=1&month=2026-03
// Returns uninvoiced repairs that belong to delivery notes issued in the target month.
export async function GET(req: NextRequest) {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;
    const { searchParams } = new URL(req.url);
    const customerId = parseInt(searchParams.get("customerId") || "");
    const month = searchParams.get("month"); // "YYYY-MM"

    if (!customerId || !month) {
        return NextResponse.json({ error: "customerId and month are required" }, { status: 400 });
    }

    if (!parseBillingMonth(month)) {
        return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }
    const { from, to } = billingMonthBounds(month);

    const repairs = await prisma.repair.findMany({
        where: {
            customerId,
            invoiceId: null,
            deliveryNote: {
                is: {
                    customerId,
                    issuedDate: { gte: from, lt: to },
                },
            },
        },
        include: {
            watch: { include: { brand: true, model: true, reference: true } },
            estimate: { include: { items: true } },
            deliveryNote: { select: { slipNumber: true, issuedDate: true } },
        },
        orderBy: { deliveryNoteId: "asc" },
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
            deliveryDate: r.deliveryNote?.issuedDate.toISOString(),
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
