import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { EstimatePDFClient } from "@/components/pdf/EstimatePDFClient";
import { formatPartDisplay } from "@/lib/formatPartDisplay";

export const dynamic = "force-dynamic";

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
                    estimate: { include: { items: { include: { partsMaster: { select: { grade: true, notes2: true } } } } } }
                }
            }
        }
    });

    if (!estimateDoc) return notFound();

    const jobs = estimateDoc.repairs.map(repair => {
        const estimateItems = repair.estimate?.items || [];
        return {
            id: String(repair.id),
            inquiryNumber: repair.inquiryNumber,
            partnerRef: repair.partnerRef || undefined,
            endUserName: (repair as any).endUserName || undefined,
            customerNote: (repair as any).customerNote || "",
            watch: {
                brand: repair.watch.brand?.name || "",
                model: repair.watch.model?.name || "",
                ref: repair.watch.reference?.name || undefined,
                serial: repair.watch.serialNumber || undefined
            },
            items: estimateItems.map(i => ({
                name: i.itemName,
                price: i.unitPrice,
                type: i.type,
                grade: i.partsMaster?.grade ?? undefined,
                note2: i.partsMaster?.notes2 ?? undefined,
                displayName: i.type === 'part'
                    ? formatPartDisplay({ name: i.itemName, grade: i.partsMaster?.grade, note2: i.partsMaster?.notes2 })
                    : i.itemName,
            }))
        };
    });

    const pdfData = {
        estimateNumber: estimateDoc.estimateNumber,
        date: estimateDoc.issuedDate.toLocaleDateString("ja-JP"),
        customer: {
            name: estimateDoc.customer.name,
            address: estimateDoc.customer.address || undefined
        },
        jobs: jobs
    };

    return <EstimatePDFClient data={pdfData} />;
}
