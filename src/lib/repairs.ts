"use server";

import { prisma } from "./prisma";
import { formatPartDisplay } from "./formatPartDisplay";
import { calculateTaxableAmounts, sumCustomerLines, type PricingTaxMode } from "./pricing-tax";

export async function getRepairDataForPDF(id: number) {
    const repair = await prisma.repair.findUnique({
        where: { id },
        include: {
            customer: true,
            watch: {
                include: { brand: true, model: true, caliber: true, reference: true, caseReference: true }
            },
            estimate: {
                include: { items: { include: { partsMaster: { select: { grade: true, notes2: true } } } } }
            },
            estimateDocument: true,
            deliveryNote: true,
            invoice: true
        }
    });

    if (!repair) return null;
    const pricingTaxMode: PricingTaxMode = repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
    const amounts = calculateTaxableAmounts(sumCustomerLines(repair.estimate?.items ?? []), pricingTaxMode);

    return {
        id: repair.inquiryNumber,
        dbId: repair.id,
        date: new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" }),
        // データベースに存在する正規の帳票番号。未発行(null)の場合は "-" を返す
        estimateNumber: repair.estimateDocument?.estimateNumber || "-",
        deliveryNumber: repair.deliveryNote?.slipNumber || "-",
        invoiceNumber: repair.invoice?.invoiceNumber || "-",
        pricingTaxMode,
        taxRate: 0.1,
        subtotalAmount: amounts.totalAmount,
        taxAmount: amounts.taxAmount,
        grossTotalAmount: amounts.grossAmount + (repair.deliveryNote?.shippingFee ?? 0),
        shippingFeeAmount: repair.deliveryNote?.shippingFee ?? 0,
        shippingFee: repair.deliveryNote?.shippingFee ?? 0,
        items: repair.deliveryNote ? [{ date: repair.deliveryNote.issuedDate.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }),
            slipNumber: repair.deliveryNote.slipNumber, description: "1点",
            amount: pricingTaxMode === "INCLUSIVE" ? amounts.grossAmount : amounts.totalAmount }] : [],

        customer: {
            name: repair.customer.name,
            type: repair.customer.type as 'individual' | 'business',
            address: repair.customer.address || "-",
        },
        jobs: [
            {
                inquiryId: repair.inquiryNumber,
                partnerRef: repair.partnerRef,
                endUserName: repair.endUserName,
                customerNote: repair.customerNote || "",
                watch: {
                    brand: repair.watch.brand.name,
                    timepieceType: repair.watch.timepieceType,
                    timepieceTypeLabel: repair.watch.timepieceTypeLabel,
                    model: repair.watch.model?.name || repair.watch.modelNameInput || "モデル未設定",
                    ref: repair.watch.reference?.name || "",
                    caseRef: repair.watch.caseReference?.name || "",
                    serial: repair.watch.serialNumber || "",
                },
                items: repair.estimate?.items.map(item => ({
                    name: item.itemName,
                    qty: item.quantity,
                    quantity: item.quantity,
                    price: item.unitPrice,
                    type: item.type as 'technical' | 'parts' | 'other',
                    grade: item.partsMaster?.grade || "",
                    note2: item.partsMaster?.notes2 || "",
                    displayName: item.type === 'part'
                        ? formatPartDisplay({ name: item.itemName, grade: item.partsMaster?.grade, note2: item.partsMaster?.notes2 })
                        : item.itemName,
                })) || []
            }
        ],
        // B2B請求書用の納品履歴。勝手な生成はやめ、正規のdeliveryNoteレコードがあればそれを使用。
        deliveries: repair.deliveryNote ? [
            {
                date: repair.deliveryNote.issuedDate.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }),
                slipNo: repair.deliveryNote.slipNumber,
                count: 1,
                amount: amounts.grossAmount
            }
        ] : []
    };
}
