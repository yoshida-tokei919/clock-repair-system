"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function generateBulkDocument(repairIds: number[], type: 'delivery' | 'invoice' | 'estimate') {
    try {
        if (repairIds.length === 0) return { success: false, error: "No repairs selected" };

        const repairs = await prisma.repair.findMany({
            where: { id: { in: repairIds } },
            include: {
                customer: true,
                estimate: { include: { items: true } }
            }
        });

        if (repairs.length === 0) return { success: false, error: "Repairs not found" };

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
            const prefix = customer.prefix || "X";

            // Calculate Totals from all selected repairs
            let totalAmount = 0;
            customerRepairs.forEach(r => {
                const subtotal = r.estimate?.items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0) || 0;
                totalAmount += subtotal;
            });
            const taxAmount = Math.floor(totalAmount * 0.1);

            let seq = 0;
            let docNumber = "";
            let documentId = null;

            if (type === 'delivery') {
                const updatedCustomer = await prisma.customer.update({
                    where: { id: customerId },
                    data: { seqDelivery: { increment: 1 } }
                });
                seq = updatedCustomer.seqDelivery;
                docNumber = `${prefix}D-${String(seq).padStart(3, '0')}`;

                const note = await prisma.deliveryNote.create({
                    data: {
                        slipNumber: docNumber,
                        customerId: customerId,
                        totalAmount,
                        taxAmount,
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

                // Default Due Date: End of next month
                const dueDate = new Date();
                dueDate.setMonth(dueDate.getMonth() + 2);
                dueDate.setDate(0); // Last day of previous month = end of next month

                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNumber: docNumber,
                        customerId: customerId,
                        totalAmount,
                        taxAmount,
                        paymentDueDate: dueDate,
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
                        totalAmount,
                        taxAmount,
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
