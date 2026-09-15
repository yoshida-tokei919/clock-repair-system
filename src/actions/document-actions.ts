"use server";

import { prisma } from "@/lib/prisma";
import {
    buildInvoiceRepairSnapshotData,
    calculateIssuedInvoiceAmounts,
    calculateInvoiceRepairSubtotal,
} from "@/lib/invoice-repair-snapshots";
import { getB2CPaymentDueDate, getNextB2CInvoiceNumberForTransaction } from "@/lib/invoice-numbering";
import { revalidatePath } from "next/cache";

export async function generateBulkDocument(repairIds: number[], type: 'delivery' | 'invoice' | 'estimate' | 'warranty') {
    try {
        if (repairIds.length === 0) return { success: false, error: "No repairs selected" };

        const uniqueRepairIds = Array.from(new Set(repairIds));
        const repairs = await prisma.repair.findMany({
            where: { id: { in: uniqueRepairIds } },
            include: {
                customer: true,
                estimate: { include: { items: true } },
                deliveryNote: { select: { slipNumber: true, issuedDate: true } },
            }
        });

        if (repairs.length === 0) return { success: false, error: "Repairs not found" };
        if (type === "invoice" && repairs.length !== uniqueRepairIds.length) {
            return { success: false, error: "請求対象の案件を確認してください" };
        }
        if (type === "invoice") {
            const invoicedRepairs = repairs.filter((repair) => repair.invoiceId !== null);
            if (invoicedRepairs.length > 0) {
                return {
                    success: false,
                    error: `請求済みの案件が含まれています: ${invoicedRepairs.map((repair) => repair.inquiryNumber).join("、")}`,
                };
            }
        }

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
                const subtotal = type === "invoice"
                    ? calculateInvoiceRepairSubtotal(r)
                    : r.estimate?.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) || 0;
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
                const isB2C = customer.type === "individual";
                if (!isB2C) {
                    const lastInvoice = await prisma.invoice.findFirst({
                        where: { invoiceNumber: { startsWith: prefix } },
                        orderBy: { id: 'desc' }
                    });
                    seq = lastInvoice
                        ? (parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '') || '0', 10) + 1)
                        : 1;
                    docNumber = `${prefix}I-${String(seq).padStart(3, '0')}`;
                }

                const invoice = await prisma.$transaction(async (tx) => {
                  const invoiceNumber = isB2C
                    ? await getNextB2CInvoiceNumberForTransaction(tx)
                    : docNumber;
                  const invoiceSeq = isB2C
                    ? Number.parseInt(invoiceNumber.slice(3), 10)
                    : seq;
                  const dueDate = isB2C ? getB2CPaymentDueDate() : (() => {
                    const date = new Date();
                    date.setMonth(date.getMonth() + 2);
                    date.setDate(0);
                    return date;
                  })();
                  const created = await tx.invoice.create({
                    data: {
                        invoiceNumber,
                        customerId: customerId,
                        ...calculateIssuedInvoiceAmounts(totalAmount),
                        paymentDueDate: dueDate,
                        repairSnapshots: { create: buildInvoiceRepairSnapshotData(customerRepairs) },
                    }
                  });
                  const claimed = await tx.repair.updateMany({
                    where: { id: { in: customerRepairs.map(r => r.id) }, customerId, invoiceId: null },
                    data: { invoiceId: created.id },
                  });
                  if (claimed.count !== customerRepairs.length) {
                    throw new Error("請求対象が変更されました。再読み込みしてください");
                  }
                  await tx.customer.update({ where: { id: customerId }, data: { seqInvoice: invoiceSeq } });
                  return created;
                });
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
