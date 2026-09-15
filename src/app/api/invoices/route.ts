import { NextRequest, NextResponse } from "next/server";
import {
    buildInvoiceRepairSnapshotData,
    calculateIssuedInvoiceAmounts,
    calculateInvoiceRepairSubtotal,
} from "@/lib/invoice-repair-snapshots";
import { getB2CPaymentDueDate, getNextB2CInvoiceNumberForTransaction } from "@/lib/invoice-numbering";
import { calculateInvoicePaymentSummary } from "@/lib/invoice-payment";
import { prisma } from "@/lib/prisma";

// GET /api/invoices — 請求書一覧
export async function GET() {
    const invoices = await prisma.invoice.findMany({
        orderBy: { issuedDate: "desc" },
        include: {
            customer: { select: { id: true, name: true, companyName: true, type: true } },
            repairs: { select: { id: true } },
            paymentAllocations: {
                select: {
                    allocatedAmount: true,
                    payment: { select: { status: true } },
                },
            },
        },
    });

    return NextResponse.json(invoices.map((invoice) => {
        if (invoice.customer.type !== "individual") return invoice;

        const paymentSummary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations);
        const paymentStatus = invoice.status === "void" || invoice.status === "canceled"
            ? "void"
            : paymentSummary.outstandingBalance <= 0
                ? "paid"
                : invoice.paymentAllocations.some(({ payment }) => payment.status === "PENDING")
                    ? "pending"
                    : "unpaid";

        return { ...invoice, paymentStatus };
    }));
}

// POST /api/invoices — 新規請求書作成（月次合算）
export async function POST(req: NextRequest) {
    const body = await req.json();
    const { customerId, repairIds, paymentDueDate } = body as {
        customerId: number;
        repairIds: number[];
        paymentDueDate?: string;
    };

    if (!customerId || !repairIds?.length) {
        return NextResponse.json({ error: "取引先と修理案件を指定してください" }, { status: 400 });
    }

    // 取引先取得・請求書番号採番
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
        return NextResponse.json({ error: "取引先が見つかりません" }, { status: 404 });
    }

    const isB2C = customer.type === "individual";

    // 対象修理の合計金額を計算
    const uniqueRepairIds = Array.from(new Set(repairIds));
    const repairs = await prisma.repair.findMany({
        where: { id: { in: uniqueRepairIds } },
        include: {
            estimate: { include: { items: true } },
            deliveryNote: { select: { slipNumber: true, issuedDate: true } },
        },
    });

    if (
        repairs.length !== uniqueRepairIds.length
        || repairs.some((repair) => repair.customerId !== customerId || repair.invoiceId !== null)
    ) {
        return NextResponse.json({ error: "請求対象の案件を確認してください" }, { status: 400 });
    }

    const subtotal = repairs.reduce((sum, r) => {
        return sum + calculateInvoiceRepairSubtotal(r);
    }, 0);
    const amounts = calculateIssuedInvoiceAmounts(subtotal);

    // トランザクションで請求書作成・修理紐付け・SEQ更新
    const invoice = await prisma.$transaction(async (tx) => {
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
                customerId,
                ...amounts,
                paymentDueDate: isB2C ? getB2CPaymentDueDate() : paymentDueDate ? new Date(paymentDueDate) : null,
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
        await tx.customer.update({
            where: { id: customerId },
            data: { seqInvoice: newSeq },
        });
        return created;
    });

    return NextResponse.json(invoice, { status: 201 });
}
