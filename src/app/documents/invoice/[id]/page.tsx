import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { InvoicePDFClient } from "@/components/pdf/InvoicePDFClient";

export const dynamic = "force-dynamic";

export default async function InvoiceDocumentPage({ params }: { params: { id: string } }) {
    const id = parseInt(params.id);
    if (isNaN(id)) return notFound();

    const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
            customer: true,
            repairs: {
                include: {
                    watch: { include: { brand: true, model: true, reference: true } },
                    estimate: { include: { items: true } },
                    invoice: true,
                    deliveryNote: true
                }
            }
        }
    });

    if (!invoice) return notFound();

    const deliveryGroups = new Map<
        string,
        {
            slipNumber: string;
            date: Date;
            repairCount: number;
            amount: number;
        }
    >();

    for (const repair of invoice.repairs) {
        const groupKey = repair.deliveryNoteId
            ? `delivery-note-id:${repair.deliveryNoteId}`
            : repair.deliveryNote?.slipNumber
              ? `delivery-note-slip:${repair.deliveryNote.slipNumber}`
              : "unlinked-delivery-note";

        const repairAmount = (repair.estimate?.items || []).reduce(
            (sum, item) => sum + item.unitPrice * item.quantity,
            0
        );
        const groupDate = repair.deliveryNote?.issuedDate || repair.deliveryDateActual || invoice.issuedDate;
        const existing = deliveryGroups.get(groupKey);

        if (existing) {
            existing.repairCount += 1;
            existing.amount += repairAmount;
            if (groupDate < existing.date) existing.date = groupDate;
        } else {
            deliveryGroups.set(groupKey, {
                slipNumber: repair.deliveryNote?.slipNumber || "未紐付け",
                date: groupDate,
                repairCount: 1,
                amount: repairAmount
            });
        }
    }

    const invoiceItems = Array.from(deliveryGroups.values())
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((group) => ({
            date: group.date.toLocaleDateString("ja-JP"),
            slipNumber: group.slipNumber,
            description: `${group.repairCount}点`,
            amount: group.amount
        }));

    const pdfData = {
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.issuedDate.toLocaleDateString("ja-JP"),
        dueDate: invoice.paymentDueDate?.toLocaleDateString("ja-JP") || "",
        customer: {
            name: invoice.customer.name,
            address: invoice.customer.address || undefined
        },
        items: invoiceItems,
        taxRate: 0.1,
        bankInfo: "三井住友銀行　店番411\n普通 3602468\nヨシダ シュウヘイ"
    };

    return <InvoicePDFClient data={pdfData} />;
}
