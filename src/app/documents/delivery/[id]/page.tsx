import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { DeliveryPDFClientLoader } from "@/components/pdf/DeliveryPDFClientLoader";
import { formatPartDisplay } from "@/lib/formatPartDisplay";
import { IssuedDateEditor } from "@/components/documents/IssuedDateEditor";
import { displayIssuedDate, formatIssuedDate } from "@/lib/document-issued-date";
import { DeliveryShippingEditor } from "@/components/documents/DeliveryShippingEditor";

export const dynamic = "force-dynamic";

export default async function DeliveryDocumentPage({ params }: { params: Promise<{ id: string }> }) {
    const id = parseInt((await params).id);
    if (isNaN(id)) return notFound();

    const note = await prisma.deliveryNote.findUnique({
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

    if (!note) return notFound();
    const [snapshotCount, linkedCount] = await Promise.all([
        prisma.invoiceRepairSnapshot.count({ where: { deliveryNoteId: id } }),
        prisma.repair.count({ where: { deliveryNoteId: id, invoiceId: { not: null } } }),
    ]);

    // Transform to props expected by DeliveryDocument
    // We need to map DB structure to PDF props

    const jobs = note.repairs.map(repair => {
        const estimateItems = repair.estimate?.items || [];
        const subtotal = estimateItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        const tax = Math.floor(subtotal * 0.1);

        return {
            inquiryNumber: repair.inquiryNumber,
            partnerRef: repair.partnerRef || undefined,
            endUserName: (repair as any).endUserName || undefined,
            watch: {
                brand: repair.watch.brand?.name || "",
                model: repair.watch.model?.name || "",
                ref: repair.watch.reference?.name || "",
                serial: repair.watch.serialNumber || ""
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
        deliveryNumber: note.slipNumber,
        date: displayIssuedDate(note.issuedDate),
        customer: {
            name: note.customer.name,
            address: note.customer.address || undefined
        },
        jobs: jobs,
        taxRate: 0.1,
        shippingFee: note.shippingFee ?? 0
    };

    return <div><div className="bg-white px-6 py-2"><IssuedDateEditor type="delivery" id={note.id} issuedDate={formatIssuedDate(note.issuedDate)} />
        <DeliveryShippingEditor id={note.id} carrierCode={note.shippingCarrierCode} size={note.shippingSize} calculatedFee={note.shippingCalculatedFee} fee={note.shippingFee} locked={snapshotCount > 0 || linkedCount > 0} /></div>
        <DeliveryPDFClientLoader data={pdfData} allowFixedPrint={note.customer.type === "business"} /></div>;
}
