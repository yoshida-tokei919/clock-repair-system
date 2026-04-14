import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { InvoicePDFClient } from "@/components/pdf/InvoicePDFClient"; // Will create this

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

    const jobs = invoice.repairs.map(repair => {
        const estimateItems = repair.estimate?.items || [];

        return {
            inquiryId: repair.inquiryNumber,
            watch: {
                brand: repair.watch.brand?.name || "",
                model: repair.watch.model?.name || "",
                ref: repair.watch.reference?.name || "",
                serial: repair.watch.serialNumber || ""
            },
            items: estimateItems.map(i => ({
                name: i.itemName,
                qty: i.quantity,
                price: i.unitPrice
            })),
            // For B2B Invoice List
            date: repair.deliveryDateActual?.toLocaleDateString("ja-JP") || invoice.issuedDate.toLocaleDateString("ja-JP"),
        };
    });

    // Transform to B2B Invoice props
    const deliveries = invoice.repairs.map(r => {
        const total = (r.estimate?.items || []).reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        return {
            date: r.deliveryDateActual?.toLocaleDateString("ja-JP") || invoice.issuedDate.toLocaleDateString("ja-JP"),
            slipNo: r.deliveryNote?.slipNumber || r.inquiryNumber,
            count: 1,
            amount: Math.floor(total * 1.1)
        };
    });

    const pdfData = {
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.issuedDate.toLocaleDateString("ja-JP"),
        dueDate: invoice.paymentDueDate?.toLocaleDateString("ja-JP") || "",
        customer: {
            name: invoice.customer.name,
            address: invoice.customer.address || undefined
        },
        items: invoice.repairs.map(r => ({
            date: r.deliveryDateActual?.toLocaleDateString("ja-JP") || invoice.issuedDate.toLocaleDateString("ja-JP"),
            slipNumber: r.deliveryNote?.slipNumber || r.inquiryNumber,
            description: `${r.watch.brand?.name} ${r.watch.model?.name} 修理代`,
            amount: (r.estimate?.items || []).reduce((s, i) => s + i.unitPrice * i.quantity, 0)
        })),
        taxRate: 0.1,
        bankInfo: "三井住友銀行\n普通 3602468\nヨシダ シュウヘイ"
    };

    return <InvoicePDFClient data={pdfData} />;
}
