import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/invoices — 請求書一覧
export async function GET() {
    const invoices = await prisma.invoice.findMany({
        orderBy: { issuedDate: "desc" },
        include: {
            customer: { select: { id: true, name: true, companyName: true } },
            repairs: { select: { id: true } },
        },
    });

    return NextResponse.json(invoices);
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

    const prefix = customer.prefix || "C";
    const newSeq = customer.seqInvoice + 1;
    const invoiceNumber = `${prefix}I-${String(newSeq).padStart(3, "0")}`;

    // 対象修理の合計金額を計算
    const repairs = await prisma.repair.findMany({
        where: { id: { in: repairIds } },
        include: { estimate: { include: { items: true } } },
    });

    const subtotal = repairs.reduce((sum, r) => {
        const repairTotal = (r.estimate?.items || []).reduce(
            (s, i) => s + i.unitPrice * i.quantity,
            0
        );
        return sum + repairTotal;
    }, 0);
    const taxAmount = Math.floor(subtotal * 0.1);

    // トランザクションで請求書作成・修理紐付け・SEQ更新
    const invoice = await prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
            data: {
                invoiceNumber,
                customerId,
                totalAmount: subtotal,
                taxAmount,
                paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
                repairs: { connect: repairIds.map((id) => ({ id })) },
            },
        });
        await tx.customer.update({
            where: { id: customerId },
            data: { seqInvoice: newSeq },
        });
        return created;
    });

    return NextResponse.json(invoice, { status: 201 });
}
