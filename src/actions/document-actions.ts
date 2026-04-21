"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function generateBulkDocument(repairIds: number[], type: 'delivery' | 'invoice' | 'estimate' | 'warranty') {
    try {
        if (repairIds.length === 0) return { success: false, error: "No repairs selected" };
        if (type === 'invoice' || type === 'warranty') {
            return { success: false, error: "請求書と保証書は一覧画面から作成できません" };
        }

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
                // 既存レコードの最大SEQを取得して採番
                const lastDelivery = await prisma.deliveryNote.findFirst({
                    where: { slipNumber: { startsWith: prefix } },
                    orderBy: { id: 'desc' }
                });
                seq = lastDelivery
                    ? (parseInt(lastDelivery.slipNumber.replace(/\D/g, '') || '0', 10) + 1)
                    : 1;
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
                await prisma.customer.update({ where: { id: customerId }, data: { seqDelivery: seq } });
                documentId = note.id;
            } else if (type === 'invoice') {
                const lastInvoice = await prisma.invoice.findFirst({
                    where: { invoiceNumber: { startsWith: prefix } },
                    orderBy: { id: 'desc' }
                });
                seq = lastInvoice
                    ? (parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '') || '0', 10) + 1)
                    : 1;
                docNumber = `${prefix}I-${String(seq).padStart(3, '0')}`;

                // Default Due Date: End of next month
                const dueDate = new Date();
                dueDate.setMonth(dueDate.getMonth() + 2);
                dueDate.setDate(0);

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
                await prisma.customer.update({ where: { id: customerId }, data: { seqInvoice: seq } });
                documentId = invoice.id;
            } else if (type === 'estimate') {
                const lastEstimate = await prisma.estimateDocument.findFirst({
                    where: { estimateNumber: { startsWith: prefix } },
                    orderBy: { id: 'desc' }
                });
                seq = lastEstimate
                    ? (parseInt(lastEstimate.estimateNumber.replace(/\D/g, '') || '0', 10) + 1)
                    : 1;
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
                await prisma.customer.update({ where: { id: customerId }, data: { seqEstimate: seq } });
                documentId = estimateDoc.id;
            } else if (type === 'warranty') {
                const lastWarranty = await prisma.warranty.findFirst({
                    where: { warrantyNumber: { startsWith: prefix } },
                    orderBy: { id: 'desc' }
                });
                seq = lastWarranty
                    ? (parseInt(lastWarranty.warrantyNumber.replace(/\D/g, '') || '0', 10) + 1)
                    : 1;
                docNumber = `${prefix}W-${String(seq).padStart(3, '0')}`;

                // 保証期間: 納品日 or 今日から1年
                const baseDate = customerRepairs[0].deliveryDateActual || new Date();
                const guaranteeEnd = new Date(baseDate);
                guaranteeEnd.setFullYear(guaranteeEnd.getFullYear() + 1);

                const warranty = await prisma.warranty.create({
                    data: {
                        warrantyNumber: docNumber,
                        customerId,
                        guaranteeStart: baseDate,
                        guaranteeEnd,
                        repairs: { connect: customerRepairs.map(r => ({ id: r.id })) }
                    }
                });
                await prisma.customer.update({ where: { id: customerId }, data: { seqWarranty: seq } });
                documentId = warranty.id;
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

export async function generateWarrantyDocument(repairId: number) {
    try {
        const repair = await prisma.repair.findUnique({
            where: { id: repairId },
            include: {
                customer: true,
                warranty: true,
            }
        });

        if (!repair) return { success: false, error: "Repair not found" };
        if (repair.warrantyId && repair.warranty) {
            return { success: true, documentId: repair.warranty.id, alreadyIssued: true };
        }

        const customer = repair.customer;
        const prefix = customer.prefix || "X";

        const lastWarranty = await prisma.warranty.findFirst({
            where: { warrantyNumber: { startsWith: prefix } },
            orderBy: { id: 'desc' }
        });
        const seq = lastWarranty
            ? (parseInt(lastWarranty.warrantyNumber.replace(/\D/g, '') || '0', 10) + 1)
            : 1;
        const warrantyNumber = `${prefix}W-${String(seq).padStart(3, '0')}`;

        const baseDate = repair.deliveryDateActual || new Date();
        const guaranteeEnd = new Date(baseDate);
        guaranteeEnd.setFullYear(guaranteeEnd.getFullYear() + 1);

        const warranty = await prisma.warranty.create({
            data: {
                warrantyNumber,
                customerId: customer.id,
                guaranteeStart: baseDate,
                guaranteeEnd,
                repairs: { connect: [{ id: repair.id }] }
            }
        });

        await prisma.customer.update({
            where: { id: customer.id },
            data: { seqWarranty: seq }
        });

        revalidatePath("/repairs");
        revalidatePath(`/repairs/${repairId}`);

        return { success: true, documentId: warranty.id, alreadyIssued: false };
    } catch (e) {
        console.error(e);
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}
