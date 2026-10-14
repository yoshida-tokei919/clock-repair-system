import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextRequest, NextResponse } from "next/server";
import {
    buildInvoiceRepairSnapshotData,
    calculateIssuedInvoiceAmounts,
    calculateInvoiceRepairSubtotal,
    aggregateDeliveryShipping,
} from "@/lib/invoice-repair-snapshots";
import { getB2CPaymentDueDate, getNextB2CInvoiceNumberForTransaction } from "@/lib/invoice-numbering";
import { calculateInvoicePaymentSummary } from "@/lib/invoice-payment";
import { prisma } from "@/lib/prisma";
import { applyPrepaymentAllocations, type RequestedAllocation } from "@/lib/prepayment-allocation";
import { b2bPaymentDueDate, billingMonthBounds, isB2BBillingRepairEligible, parseBillingMonth } from "@/lib/b2b-billing-month";
import { resolveIssuedDate } from "@/lib/document-issued-date";

// GET /api/invoices — 請求書一覧
export async function GET() {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;
    const invoices = await prisma.invoice.findMany({
        orderBy: { issuedDate: "desc" },
        include: {
            customer: { select: { id: true, name: true, companyName: true, type: true } },
            repairs: { select: { id: true } },
            paymentAllocations: {
                select: {
                    allocatedAmount: true,
                    releases: { select: { amount: true } },
                    payment: {
                        select: {
                            kind: true,
                            status: true,
                            refunds: { select: { amount: true, status: true } },
                        },
                    },
                },
            },
        },
    });

    return NextResponse.json(invoices.map((invoice) => {
        const responseInvoice = {
            ...invoice,
            paymentAllocations: invoice.paymentAllocations.map((allocation) => ({
                allocatedAmount: allocation.allocatedAmount,
                payment: { status: allocation.payment.status },
            })),
        };
        if (invoice.customer.type !== "individual") return responseInvoice;

        const paymentSummary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations);
        const paymentStatus = invoice.status === "void" || invoice.status === "canceled"
            ? "void"
            : paymentSummary.outstandingBalance <= 0
                ? "paid"
                : invoice.paymentAllocations.some(({ payment }) =>
                    payment.status === "PENDING" || payment.refunds.some(refund => refund.status === "PENDING"))
                    ? "pending"
                    : "unpaid";

        return { ...responseInvoice, paymentStatus };
    }));
}

// POST /api/invoices — 新規請求書作成（月次合算）
export async function POST(req: NextRequest) {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;
    const body = await req.json();
    const { customerId, repairIds, billingMonth, issuedDate: issueDate, allocations = [] } = body as {
        customerId: number;
        repairIds: number[];
        billingMonth?: string;
        issuedDate?: string;
        allocations?: RequestedAllocation[];
    };
    let issuedDate: Date;
    try { issuedDate = resolveIssuedDate(issueDate); }
    catch { return NextResponse.json({ error: "有効な発行日を指定してください" }, { status: 400 }); }

    if (!customerId || !repairIds?.length) {
        return NextResponse.json({ error: "取引先と修理案件を指定してください" }, { status: 400 });
    }

    // 取引先取得・請求書番号採番
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
        return NextResponse.json({ error: "取引先が見つかりません" }, { status: 404 });
    }

    const isB2C = customer.type === "individual";
    if (!isB2C && !parseBillingMonth(billingMonth)) {
        return NextResponse.json({ error: "対象月はYYYY-MM形式で指定してください" }, { status: 400 });
    }
    const bounds = !isB2C ? billingMonthBounds(billingMonth!) : null;

    // 対象修理の合計金額を計算
    const uniqueRepairIds = Array.from(new Set(repairIds));
    const repairs = await prisma.repair.findMany({
        where: { id: { in: uniqueRepairIds } },
        include: {
            estimate: { include: { items: true } },
            deliveryNote: { select: { id: true, slipNumber: true, issuedDate: true, customerId: true, shippingFee: true } },
        },
    });

    if (
        repairs.length !== uniqueRepairIds.length
        || repairs.some((repair) => repair.customerId !== customerId || repair.invoiceId !== null
            || (bounds && !isB2BBillingRepairEligible(repair, customerId, bounds)))
    ) {
        return NextResponse.json({ error: "請求対象の案件を確認してください" }, { status: 400 });
    }

    const subtotal = repairs.reduce((sum, r) => {
        return sum + calculateInvoiceRepairSubtotal(r);
    }, 0);

    // トランザクションで請求書作成・修理紐付け・SEQ更新
    try {
    const invoice = await prisma.$transaction(async (tx) => {
        for (const note of [...new Map(repairs.filter(repair => repair.deliveryNote).map(repair => [repair.deliveryNote!.id, repair.deliveryNote!])).values()].sort((a, b) => a.id - b.id)) {
            const [locked] = await tx.$queryRaw<{ issuedDate: Date; shippingFee: number | null }[]>`
                SELECT "issuedDate", "shippingFee" FROM "DeliveryNote" WHERE "id" = ${note.id} FOR UPDATE`;
            if (!locked || locked.issuedDate.getTime() !== note.issuedDate.getTime() || locked.shippingFee !== note.shippingFee) {
                throw new Error("納品書の発行日または送料が変更されました。再読み込みしてください");
            }
        }
        let newSeq: number;
        let invoiceNumber: string;

        if (isB2C) {
            invoiceNumber = await getNextB2CInvoiceNumberForTransaction(tx);
            newSeq = Number.parseInt(invoiceNumber.slice(3), 10);
        } else {
            // Keep the existing B2B per-customer numbering behavior unchanged.
            const prefix = customer.prefix || "C";
            newSeq = customer.seqInvoice + 1;
            invoiceNumber = `${prefix}I-${String(newSeq).padStart(3, "0")}`;
        }

        const created = await tx.invoice.create({
            data: {
                invoiceNumber,
                issuedDate,
                customerId,
                ...calculateIssuedInvoiceAmounts(subtotal, aggregateDeliveryShipping(repairs)),
                billingMonth: isB2C ? null : billingMonth,
                paymentDueDate: isB2C ? getB2CPaymentDueDate() : b2bPaymentDueDate(billingMonth!),
                repairSnapshots: { create: buildInvoiceRepairSnapshotData(repairs) },
            },
        });
        const claimed = await tx.repair.updateMany({
            where: { id: { in: uniqueRepairIds }, customerId, invoiceId: null },
            data: { invoiceId: created.id },
        });
        if (claimed.count !== uniqueRepairIds.length) {
            throw new Error("請求対象が変更されました。再読み込みしてください");
        }
        if (isB2C) await applyPrepaymentAllocations(tx, {
            invoiceId: created.id, customerId, repairIds: uniqueRepairIds,
            gross: created.grossTotalAmount, requested: allocations,
        });
        await tx.customer.update({
            where: { id: customerId },
            data: { seqInvoice: newSeq },
        });
        return created;
    });

    return NextResponse.json(invoice, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "請求書を作成できません" }, { status: 409 });
    }
}
