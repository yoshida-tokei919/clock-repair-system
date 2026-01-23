"use server";

import { prisma } from "./prisma";

export async function getRepairDataForPDF(id: number) {
    const repair = await prisma.repair.findUnique({
        where: { id },
        include: {
            customer: true,
            watch: {
                include: { brand: true, model: true, caliber: true, reference: true }
            },
            estimate: {
                include: { items: true }
            },
            estimateDocument: true,
            deliveryNote: true,
            invoice: true
        }
    });

    if (!repair) return null;

    return {
        id: repair.inquiryNumber,
        dbId: repair.id,
        date: new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" }),
        // データベースに存在する正規の帳票番号。未発行(null)の場合は "-" を返す
        estimateNumber: repair.estimateDocument?.estimateNumber || "-",
        deliveryNumber: repair.deliveryNote?.slipNumber || "-",
        invoiceNumber: repair.invoice?.invoiceNumber || "-",

        customer: {
            name: repair.customer.name,
            type: repair.customer.type as 'individual' | 'business',
            address: repair.customer.address || "-",
        },
        jobs: [
            {
                inquiryId: repair.inquiryNumber,
                partnerRef: repair.partnerRef,
                watch: {
                    brand: repair.watch.brand.name,
                    model: repair.watch.model.name,
                    ref: repair.watch.reference?.name || "-",
                    serial: repair.watch.serialNumber || "-",
                },
                items: repair.estimate?.items.map(item => ({
                    name: item.itemName,
                    qty: 1,
                    price: item.unitPrice,
                    type: item.type as 'technical' | 'parts' | 'other'
                })) || []
            }
        ],
        // B2B請求書用の納品履歴。勝手な生成はやめ、正規のdeliveryNoteレコードがあればそれを使用。
        deliveries: repair.deliveryNote ? [
            {
                date: repair.deliveryNote.issuedDate.toLocaleDateString("ja-JP"),
                slipNo: repair.deliveryNote.slipNumber,
                count: 1,
                amount: Math.floor((repair.estimate?.items.reduce((s, i) => s + i.unitPrice, 0) || 0) * 1.1)
            }
        ] : []
    };
}
