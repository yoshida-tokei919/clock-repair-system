"use server";

import { prisma } from "@/lib/prisma";
import {
    buildInvoiceRepairSnapshotData,
    calculateIssuedInvoiceAmounts,
    calculateInvoiceRepairSubtotal,
    aggregateDeliveryShipping,
} from "@/lib/invoice-repair-snapshots";
import { assertNoDuplicateReturnShipping, assertSingleCustomerDeliverySelection, validateDeliveryShipping, type DeliveryShippingInput } from "@/lib/delivery-shipping";
import { getB2CPaymentDueDate, getNextB2CInvoiceNumberForTransaction } from "@/lib/invoice-numbering";
import { nextB2BSourceInvoiceNumber, resolveInvoiceRecipientForIssue } from "@/lib/invoice-recipient";
import { revalidatePath } from "next/cache";
import { applyPrepaymentAllocations, availablePrepayment, findEligiblePrepayments, suggestPrepaymentAllocations, type RequestedAllocation } from "@/lib/prepayment-allocation";
import { b2bPaymentDueDate, billingMonthBounds, billingMonthFromDate, isB2BBillingRepairEligible } from "@/lib/b2b-billing-month";
import { getAdminApiIdentity } from "@/lib/admin-api-auth";
import { resolveIssuedDate } from "@/lib/document-issued-date";
import { calculateTaxableAmounts, commonEstimateMode, sumCustomerLines } from "@/lib/pricing-tax";

export async function previewBulkInvoiceAllocations(repairIds: number[]) {
    if (!await getAdminApiIdentity()) throw new Error("認証が必要です");
    const ids = [...new Set(repairIds)];
    if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("修理案件を選択してください");
    const repairs = await prisma.repair.findMany({ where: { id: { in: ids } },
        include: { customer: true, estimate: { include: { items: true } },
            deliveryNote: { select: { id: true, slipNumber: true, issuedDate: true, shippingFee: true, pricingTaxMode: true } } } });
    if (repairs.length !== ids.length || repairs.some(repair => repair.invoiceId !== null)) throw new Error("請求対象が変更されました");
    const groups = new Map<number, typeof repairs>();
    for (const repair of repairs) groups.set(repair.customerId, [...(groups.get(repair.customerId) ?? []), repair]);
    const result = [];
    for (const [customerId, group] of groups) {
        const mode = commonEstimateMode(group);
        if (group.some(repair => repair.deliveryNote && repair.deliveryNote.pricingTaxMode !== mode)) throw new Error("納品書と見積の税表示方式が一致しません");
        const gross = calculateIssuedInvoiceAmounts(group.reduce((sum, repair) => sum + calculateInvoiceRepairSubtotal(repair), 0), aggregateDeliveryShipping(group), mode).grossTotalAmount;
        const isB2C = group[0].customer.type === "individual";
        const payments = isB2C ? await findEligiblePrepayments(prisma, customerId, group.map(repair => repair.id)) : [];
        const receivedPrepaymentAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
        const availablePrepaymentAmount = payments.reduce((sum, payment) => sum + availablePrepayment(payment), 0);
        const eligible = payments.map(payment => ({ id: payment.id, repairId: payment.repairId, purpose: payment.purpose,
            paidAt: payment.paidAt, receivedAmount: payment.amount,
            availableAmount: availablePrepayment(payment) })).filter(payment => payment.availableAmount > 0);
        result.push({ customerId, customerName: group[0].customer.name, isB2C, gross,
            receivedPrepaymentAmount, availablePrepaymentAmount,
            repairs: group.map(repair => ({ id: repair.id, inquiryNumber: repair.inquiryNumber })),
            payments: eligible, suggested: suggestPrepaymentAllocations(payments, gross) });
    }
    return result;
}

export async function generateBulkDocument(repairIds: number[], type: 'delivery' | 'invoice' | 'estimate' | 'warranty', allocationsByCustomer?: Record<number, RequestedAllocation[]>, issueDate?: string, shippingInput?: DeliveryShippingInput) {
    try {
        if (!await getAdminApiIdentity()) throw new Error("認証が必要です");
        const issuedDate = resolveIssuedDate(issueDate);
        const shipping = type === "delivery" ? validateDeliveryShipping(shippingInput!) : null;
        if (repairIds.length === 0) return { success: false, error: "No repairs selected" };

        const uniqueRepairIds = Array.from(new Set(repairIds));
        const repairs = await prisma.repair.findMany({
            where: { id: { in: uniqueRepairIds } },
            include: {
                customer: true,
                estimate: { include: { items: true } },
                deliveryNote: { select: { id: true, slipNumber: true, issuedDate: true, customerId: true, shippingFee: true, pricingTaxMode: true } },
            }
        });

        if (repairs.length === 0) return { success: false, error: "Repairs not found" };
        if (type === "delivery") {
            assertNoDuplicateReturnShipping(repairs, shipping!.shippingFee);
            if (repairs.length !== uniqueRepairIds.length) return { success: false, error: "納品書の対象案件を再確認してください" };
            assertSingleCustomerDeliverySelection(repairs);
        }
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
        if (type === "invoice") {
            for (const customerId of customerIds) {
                const group = repairsByCustomer[customerId];
                if (group[0].customer.type === "individual") continue;
                const month = group[0].deliveryNote && billingMonthFromDate(group[0].deliveryNote.issuedDate);
                if (!month || group.some(repair => !isB2BBillingRepairEligible(repair, customerId, billingMonthBounds(month)))) {
                    return { success: false, error: "法人請求は同じ対象月の納品済み未請求案件を選択してください" };
                }
            }
        }
        let lastDocumentId = null;
        let createdCount = 0;

        for (const customerId of customerIds) {
            const customerRepairs = repairsByCustomer[customerId];
            const customer = customerRepairs[0].customer;
            const prefix = customer.prefix || "X";

            // Calculate Totals from all selected repairs
            const pricingTaxMode = type === "warranty" ? "EXCLUSIVE" : commonEstimateMode(customerRepairs);
            if (type === "invoice" && customerRepairs.some(repair => repair.deliveryNote && repair.deliveryNote.pricingTaxMode !== pricingTaxMode)) {
                throw new Error("納品書と見積の税表示方式が一致しません");
            }
            const lineSum = type === "warranty" ? 0 : customerRepairs.reduce((sum, repair) => sum + sumCustomerLines(repair.estimate?.items ?? []), 0);
            const { totalAmount, taxAmount } = calculateTaxableAmounts(lineSum, pricingTaxMode);

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
                        issuedDate,
                        customerId: customerId,
                        totalAmount,
                        taxAmount,
                        pricingTaxMode,
                        ...shipping,
                        repairs: { connect: customerRepairs.map(r => ({ id: r.id })) }
                    }
                });
                await prisma.customer.update({ where: { id: customerId }, data: { seqDelivery: seq } });
                documentId = note.id;
            } else if (type === 'invoice') {
                const isB2C = customer.type === "individual";
                const billingMonth = !isB2C && customerRepairs[0].deliveryNote
                    ? billingMonthFromDate(customerRepairs[0].deliveryNote.issuedDate) : null;
                const invoice = await prisma.$transaction(async (tx) => {
                  const { source, billingCustomerId } = await resolveInvoiceRecipientForIssue(tx, customerId);
                  if (source.type !== customer.type || source.prefix !== customer.prefix) {
                    throw new Error("請求元の顧客設定が変更されました。再読み込みしてください");
                  }
                  // Serialize issue-date edits with invoice snapshot creation.
                  for (const note of [...new Map(customerRepairs.filter(r => r.deliveryNote).map(r => [r.deliveryNote!.id, r.deliveryNote!])).values()].sort((a, b) => a.id - b.id)) {
                    const [locked] = await tx.$queryRaw<{ issuedDate: Date; shippingFee: number | null }[]>`
                      SELECT "issuedDate", "shippingFee" FROM "DeliveryNote" WHERE "id" = ${note.id} FOR UPDATE`;
                    if (!locked || locked.issuedDate.getTime() !== note.issuedDate.getTime() || locked.shippingFee !== note.shippingFee) {
                      throw new Error("納品書の発行日または送料が変更されました。再読み込みしてください");
                    }
                  }
                  const sourceNumber = isB2C ? null : nextB2BSourceInvoiceNumber(source);
                  const invoiceNumber = isB2C
                    ? await getNextB2CInvoiceNumberForTransaction(tx)
                    : sourceNumber!.invoiceNumber;
                  const invoiceSeq = isB2C
                    ? Number.parseInt(invoiceNumber.slice(3), 10)
                    : sourceNumber!.sequence;
                  const dueDate = isB2C ? getB2CPaymentDueDate() : b2bPaymentDueDate(billingMonth!);
                  const created = await tx.invoice.create({
                    data: {
                        invoiceNumber,
                        issuedDate,
                        customerId: customerId,
                        billingCustomerId,
                        ...calculateIssuedInvoiceAmounts(lineSum, aggregateDeliveryShipping(customerRepairs), pricingTaxMode),
                        pricingTaxMode,
                        billingMonth,
                        paymentDueDate: dueDate,
                        repairSnapshots: { create: buildInvoiceRepairSnapshotData(customerRepairs, pricingTaxMode) },
                    }
                  });
                  const claimed = await tx.repair.updateMany({
                    where: { id: { in: customerRepairs.map(r => r.id) }, customerId, invoiceId: null },
                    data: { invoiceId: created.id },
                  });
                  if (claimed.count !== customerRepairs.length) {
                    throw new Error("請求対象が変更されました。再読み込みしてください");
                  }
                  if (isB2C) await applyPrepaymentAllocations(tx, {
                    invoiceId: created.id, customerId, repairIds: customerRepairs.map(r => r.id),
                    gross: created.grossTotalAmount, requested: allocationsByCustomer?.[customerId] ?? [],
                  });
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
                        issuedDate,
                        customerId: customerId,
                        totalAmount,
                        taxAmount,
                        pricingTaxMode,
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
                        issuedDate,
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

export async function generateWarrantyDocument(repairId: number, issueDate?: string) {
    try {
        if (!await getAdminApiIdentity()) throw new Error("認証が必要です");
        const issuedDate = resolveIssuedDate(issueDate);
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
                issuedDate,
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
