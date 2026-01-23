import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { EstimatePDFClient } from "@/components/pdf/EstimatePDFClient";

export default async function EstimateDocumentPage({ params }: { params: { id: string } }) {
    const id = parseInt(params.id);
    if (isNaN(id)) return notFound();

    const estimateDoc = await prisma.estimateDocument.findUnique({
        where: { id },
        include: {
            customer: true,
            repairs: {
                include: {
                    watch: { include: { brand: true, model: true, reference: true } },
                    estimate: { include: { items: true } }
                }
            }
        }
    });

    if (!estimateDoc) return notFound();

    const jobs = estimateDoc.repairs.map(repair => {
        const estimateItems = repair.estimate?.items || [];
        return {
            inquiryId: repair.inquiryNumber,
            endUser: (repair as any).endUserName || undefined,
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
            photos: []
        };
    });

    const pdfData = {
        id: String(estimateDoc.id),
        estimateNumber: estimateDoc.estimateNumber,
        date: estimateDoc.issuedDate.toLocaleDateString("ja-JP"),
        customer: {
            name: estimateDoc.customer.name,
            type: estimateDoc.customer.type as 'individual' | 'business',
            address: estimateDoc.customer.address || undefined
        },
        jobs: jobs
    };

    return <EstimatePDFClient data={pdfData} />;
}
