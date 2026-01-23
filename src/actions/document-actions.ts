"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function generateBulkDocument(repairIds: number[], type: 'delivery' | 'invoice' | 'estimate') {
    try {
        if (repairIds.length === 0) return { success: false, error: "No repairs selected" };

        const repairs = await prisma.repair.findMany({
            where: { id: { in: repairIds } },
            include: { customer: true }
        });

        if (repairs.length === 0) return { success: false, error: "Repairs not found" };

        // Group by Customer ID to ensure we don't mix customers in one document
        const repairsByCustomer: Record<number, typeof repairs> = {};
        for (const r of repairs) {
            if (!repairsByCustomer[r.customerId]) repairsByCustomer[r.customerId] = [];
            repairsByCustomer[r.customerId].push(r);
        }

        const customerIds = Object.keys(repairsByCustomer).map(Number);

        let lastDocumentId = null;
        let createdCount = 0;

        for (const customerId of customerIds) {
            const customerRepairs = repairsByCustomer[customerId];
            const customer = customerRepairs[0].customer;

            // Generate Numbering
            // Prefix: customer.prefix or 'GEN' (Generic)
            // Type: T = Delivery, I = Invoice, E = Estimate (Wait, user said "D" for Delivery? "T+DeliveryのD")
            // User example: "T" (prefix) + "D" (Delivery) + "-001" (Seq) -> TD-001
            // Estimate matching: "T" + "E" (Estimate) -> TE-001
            // Invoice matching: "T" + "I" (Invoice) -> TI-001

            // Assume Prefix comes from Customer.prefix (e.g. "T"). If null, maybe use "X"?
            const prefix = customer.prefix || "X";

            let seq = 0;
            let docNumber = "";
            let documentId = null;

            // Update Customer Sequence atomically-ish (Prisma doesn't strictly lock, but update is atomic)
            if (type === 'delivery') {
                const updatedCustomer = await prisma.customer.update({
                    where: { id: customerId },
                    data: { seqDelivery: { increment: 1 } }
                });
                seq = updatedCustomer.seqDelivery;
                docNumber = `${prefix}D-${String(seq).padStart(3, '0')}`;

                // Create DeliveryNote
                // Calculate Totals (Simplified for now, just sum existing estimate totals if available?)
                // Actually, logic is usually recalculation.
                // For now, let's create the shell.
                const note = await prisma.deliveryNote.create({
                    data: {
                        slipNumber: docNumber,
                        customerId: customerId,
                        repairs: { connect: customerRepairs.map(r => ({ id: r.id })) }
                    }
                });
                documentId = note.id;
            } else if (type === 'invoice') {
                const updatedCustomer = await prisma.customer.update({
                    where: { id: customerId },
                    data: { seqInvoice: { increment: 1 } }
                });
                seq = updatedCustomer.seqInvoice;
                docNumber = `${prefix}I-${String(seq).padStart(3, '0')}`;

                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNumber: docNumber,
                        customerId: customerId,
                        repairs: { connect: customerRepairs.map(r => ({ id: r.id })) }
                    }
                });
                documentId = invoice.id;
            } else if (type === 'estimate') {
                const updatedCustomer = await prisma.customer.update({
                    where: { id: customerId },
                    data: { seqEstimate: { increment: 1 } }
                });
                seq = updatedCustomer.seqEstimate;
                docNumber = `${prefix}E-${String(seq).padStart(3, '0')}`;

                const estimateDoc = await prisma.estimateDocument.create({
                    data: {
                        estimateNumber: docNumber,
                        customerId: customerId,
                        repairs: { connect: customerRepairs.map(r => ({ id: r.id })) }
                    }
                });
                documentId = estimateDoc.id;
            }

            if (documentId) {
                lastDocumentId = documentId;
                createdCount++;
            }
        }

        revalidatePath("/repairs");
        return { success: true, count: createdCount, documentId: createdCount === 1 ? lastDocumentId : null };

    } catch (e) {
        console.error(e);
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}
