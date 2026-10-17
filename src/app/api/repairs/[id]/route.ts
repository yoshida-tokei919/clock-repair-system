import { getAdminApiIdentity } from "@/lib/admin-api-auth";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOrCreateCaliber, findOrCreateWatchReference, resolveBrand } from "@/lib/master-normalize";
import { resolveRepairMovementMaker } from "@/lib/repair-movement-maker";
import { createOrUpdatePartsMaster } from "@/lib/parts-master";
import { mergeWatchRefs, resolvePatchCaseRef, resolvePatchProductRef } from "@/lib/parts-master-compatibility";
import { parseTimepieceType, TimepieceTypeError } from "@/lib/timepiece-type";
import { getRepairPartType, isExistingRepairPartLink, RepairPartValidationError, validateRepairPartItem } from "@/lib/repair-part-validation";
import { estimateItemSnapshots } from "@/lib/estimate-item-snapshots";
import { syncPricingRulesFromRepairLineItems } from "@/lib/pricing-rules";
import { calculateTaxableAmounts, effectivePricingTaxMode, repairPartBasePrice, sumCustomerLines } from "@/lib/pricing-tax";
import {
    estimateItemsLikeToRepairLineItemInputs,
    replaceRepairLineItems,
} from "@/lib/repair-line-items";
import {
    normalizePhotoSharing,
    repairPhotoCategory,
    repairPhotoStage,
} from "@/lib/repair-photo-sharing";
import { enforceRepairPhotoPostingOptOut } from "@/lib/repair-photo-posting-opt-out";
import { getRepairStatusTransition } from "@/lib/repair-status-transition";
import { assertRepairStatus, correctManualStatusDate, ManualStatusValidationError, parseManualDate, persistManualRepairStatus } from "@/lib/repair-manual-status";

function normalizeCustomerType(value?: string | null): "business" | "individual" | null {
    if (value === "business") return "business";
    if (value === "individual") return "individual";
    return null;
}

function requireCustomerType(value?: string | null): "business" | "individual" {
    const customerType = normalizeCustomerType(value);
    if (!customerType) {
        throw new Error("customer.type must be business or individual.");
    }
    return customerType;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getAdminApiIdentity();
    if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
    try {
        const id = parseInt((await params).id);
        const body = await req.json();

        // Repair updates can include estimate and parts-master synchronization.
        // Keep the interactive transaction open long enough for those writes.
        const result = await prisma.$transaction(async (tx) => {
            const repairRecord = await tx.repair.findUnique({
                where: { id },
                include: { watch: { include: { brand: true, model: true, caliber: true, reference: true, caseReference: true } } }
            });

            if (!repairRecord) {
                throw new Error("修琁E��録が見つかりません");
            }
            const [sourceCustomer, savedEstimate] = await Promise.all([
                tx.customer.findUniqueOrThrow({ where: { id: repairRecord.customerId }, select: { type: true, pricingTaxMode: true } }),
                tx.estimate.findUnique({ where: { repairId: id }, select: { pricingTaxMode: true } }),
            ]);
            const pricingTaxMode = savedEstimate?.pricingTaxMode === "INCLUSIVE"
                ? "INCLUSIVE" : savedEstimate ? "EXCLUSIVE" : effectivePricingTaxMode(sourceCustomer);

            // Capture this Repair's persisted PART links before the replacement deletes them.
            const persistedPartLinks = new Map((await tx.repairLineItem.findMany({
                where: { repairId: id, lineType: "PART" },
                select: { id: true, partsMasterId: true },
            })).map((line) => [line.id, line.partsMasterId]));

            let brandId = repairRecord.watch.brandId;
            let modelId = repairRecord.watch.modelId;
            let caliberId = repairRecord.watch.caliberId;
            let referenceId = repairRecord.watch.referenceId;
            const productRef = resolvePatchProductRef(body.watch, repairRecord.watch.reference?.name);
            let caseReferenceId = repairRecord.watch.caseReferenceId;
            const caseRef = resolvePatchCaseRef(body.watch, repairRecord.watch.caseReference?.name);
            let movementMakerId = repairRecord.movementMakerId;
            let movementCaliberId = repairRecord.movementCaliberId;
            let baseMovementMakerId = repairRecord.baseMovementMakerId;
            let baseMovementCaliberId = repairRecord.baseMovementCaliberId;

            // 1. Update Watch Details (Smart Match)
            if (body.watch) {
                const brandNameInput = body.watch.brand;
                const brand = brandNameInput ? await resolveBrand(tx as any, brandNameInput) : null;
                if (!brand) {
                    throw new Error("ブランド名が�E力されてぁE��せん");
                }

                brandId = brand.id;

                // Model Handling
                if (body.watch.model) {
                    const model = await tx.model.findFirst({
                        where: {
                            brandId: brand.id,
                            OR: [
                                { name: body.watch.model },
                                { nameEn: body.watch.model },
                                { nameJp: body.watch.model }
                            ]
                        }
                    });

                    if (model) {
                        modelId = model.id;
                    } else {
                        const newModel = await tx.model.create({
                            data: { name: body.watch.model, nameJp: body.watch.model, brandId: brand.id }
                        });
                        modelId = newModel.id;
                    }
                }

                // Caliber Handling
                if (body.watch.caliber) {
                    const cal = await findOrCreateCaliber(tx as any, body.watch.caliber, brand.id);
                    caliberId = cal.id;
                }

                movementMakerId = await resolveRepairMovementMaker(tx, body.watch.movementMaker);

                const movementCaliberInput = (body.watch.movementCaliber || "").trim();
                movementCaliberId = movementCaliberInput
                    ? (await findOrCreateCaliber(tx as any, movementCaliberInput, movementMakerId)).id
                    : null;

                baseMovementMakerId = await resolveRepairMovementMaker(tx, body.watch.baseMovementMaker);

                const baseMovementCaliberInput = (body.watch.baseMovementCaliber || "").trim();
                baseMovementCaliberId = baseMovementCaliberInput
                    ? (await findOrCreateCaliber(tx as any, baseMovementCaliberInput, baseMovementMakerId)).id
                    : null;

                // Rebind retained refs as well when the model changes. A WatchReference
                // must belong to the Watch's current model.
                const modelChanged = modelId !== repairRecord.watch.modelId;
                if (productRef.supplied || modelChanged) {
                    if (productRef.name && !modelId) throw new Error("Model Ref にはモデルが必要です。");
                    referenceId = null;
                    if (productRef.name && modelId) {
                        referenceId = (await findOrCreateWatchReference(tx, modelId, productRef.name, caliberId)).id;
                    }
                }
                if (caseRef.supplied || modelChanged) {
                    if (caseRef.name && !modelId) throw new Error("Case Ref にはモデルが必要です。");
                    caseReferenceId = null;
                    if (caseRef.name && modelId) {
                        caseReferenceId = (await findOrCreateWatchReference(tx, modelId, caseRef.name, null)).id;
                    }
                }

                // Sync Watch Record (Always refresh to avoid "-" display)
                await tx.watch.update({
                    where: { id: repairRecord.watchId },
                    data: {
                        brandId: brandId,
                        modelId: modelId,
                        referenceId: referenceId,
                        caseReferenceId,
                        caliberId: caliberId,
                        serialNumber: body.watch.serial || null,
                        ...(body.watch.timepieceType !== undefined ? parseTimepieceType(body.watch.timepieceType) : {}),
                    }
                });
            }

            // 2. Update Customer Details
            let customerType: "business" | "individual";
            if (body.customer) {
                customerType = requireCustomerType(body.customer.type);
                await tx.customer.update({
                    where: { id: repairRecord.customerId },
                    data: {
                        type: customerType,
                        isPartner: customerType === 'business',
                        ...(customerType === 'individual' ? {
                            pricingTaxMode: "EXCLUSIVE",
                            defaultShippingCarrierCode: null,
                            defaultShippingServiceCode: null,
                            defaultShippingSize: null,
                            defaultShippingFee: null,
                        } : {}),
                        prefix: customerType === 'business' ? body.customer.prefix || undefined : 'C',
                        name: body.customer.name,
                        phone: body.customer.phone || null,
                        lineId: body.customer.lineId || null,
                        address: body.customer.address || null,
                        companyName: customerType === 'business' ? body.customer.name : null
                    }
                });
            } else {
                const customer = await tx.customer.findUnique({
                    where: { id: repairRecord.customerId },
                    select: { type: true },
                });
                customerType = requireCustomerType(customer?.type);
            }

            // 3. Update Repair Fields
            const hasEstimateItems = Array.isArray(body.estimate?.items) && body.estimate.items.length > 0;
            const requestedStatus = body.status ?? repairRecord.status;
            const dbStatus = requestedStatus === "受付" && hasEstimateItems && repairRecord.status !== "送付待ち"
                ? "見積中"
                : requestedStatus;
            assertRepairStatus(dbStatus);
            if (body.statusDateUpdates !== undefined && (typeof body.statusDateUpdates !== "object" || body.statusDateUpdates === null || Array.isArray(body.statusDateUpdates))) {
                throw new ManualStatusValidationError("ステータス日付が不正です。");
            }
            const statusDateUpdates = new Map<string, Date>();
            for (const [key, value] of Object.entries(body.statusDateUpdates ?? {})) {
                assertRepairStatus(key);
                statusDateUpdates.set(key, parseManualDate(value));
            }
            const statusTransition = dbStatus !== repairRecord.status
                ? getRepairStatusTransition(repairRecord.status, dbStatus)
                : {};
            const rawEndUserName = body.customer?.endUserName ?? body.request?.endUserName ?? null;
            const endUserName = rawEndUserName && String(rawEndUserName).trim() ? String(rawEndUserName).trim() : null;
            const photoPostingOptOut = typeof body.photoPostingOptOut === "boolean"
                ? body.photoPostingOptOut
                : repairRecord.photoPostingOptOut;

            let updatedRepair = await tx.repair.update({
                where: { id },
                data: {
                    status: dbStatus,
                    ...statusTransition,
                    movementMakerId,
                    movementCaliberId,
                    baseMovementMakerId,
                    baseMovementCaliberId,
                    partnerRef: body.request?.partnerRef || null,
                    accessories: JSON.stringify(body.request?.accessories || []),
                    workSummary: body.request?.diagnosis || null,
                    internalNotes: body.request?.internalNotes || null,
                    customerNote: body.request?.customerNote ?? null,
                    endUserName,
                    photoPostingOptOut,
                }
            });

            await enforceRepairPhotoPostingOptOut(tx, id, photoPostingOptOut);

            if (hasEstimateItems && dbStatus === "見積中") {
                const receptionLog = await tx.repairStatusLog.findFirst({ where: { repairId: id, status: "受付" }, select: { id: true } });
                if (!receptionLog) await tx.repairStatusLog.create({
                    data: { repairId: id, status: "受付", changedAt: repairRecord.createdAt, changedBy: admin.id },
                });
            }

            // 4. Update Estimates
            if (body.estimate?.items) {
                const lineSum = sumCustomerLines(body.estimate.items.map((item: any) => ({ unitPrice: item.price, quantity: item.quantity ?? 1 })));
                const techFee = body.estimate.items
                    .filter((item: any) => item.type === 'labor')
                    .reduce((sum: number, item: any) => sum + item.price * (item.quantity ?? 1), 0);
                const partsFee = body.estimate.items
                    .filter((item: any) => item.type === 'part')
                    .reduce((sum: number, item: any) => sum + item.price * (item.quantity ?? 1), 0);
                const { totalAmount, taxAmount } = calculateTaxableAmounts(lineSum, pricingTaxMode);

                // Use the returned estimate from upsert directly
                const estimate = await tx.estimate.upsert({
                    where: { repairId: id },
                    create: {
                        repairId: id,
                        technicalFee: techFee,
                        partsTotal: partsFee,
                        totalAmount,
                        taxAmount,
                        pricingTaxMode,
                    },
                    update: {
                        technicalFee: techFee,
                        partsTotal: partsFee,
                        totalAmount,
                        taxAmount,
                        pricingTaxMode,
                    }
                });

                if (estimate) {
                    // Transaction-safe deletion and creation
                    await tx.estimateItem.deleteMany({ where: { estimateId: estimate.id } });

                    if (body.estimate.items.length > 0) {
                        const currentWatchRefs = mergeWatchRefs(
                            productRef.name,
                            caseRef.name
                        );
                        const syncedEstimateItems = await Promise.all(body.estimate.items.map(async (item: any) => {
                            if (item.type !== 'part') return item;
                            const isInteriorPart = getRepairPartType(item) === "interior";

                            if (item.partsMasterId) {
                                const existingMaster = await tx.partsMaster.findUnique({ where: { id: Number(item.partsMasterId) } });
                                if (!existingMaster) throw new RepairPartValidationError("指定された部品が見つかりません。");
                                const allowLegacyResave = isExistingRepairPartLink(
                                    item.repairLineItemId, item.partsMasterId, persistedPartLinks
                                );
                                const validatedName = await validateRepairPartItem(tx, item.standardPartNameId, existingMaster, {
                                    partType: isInteriorPart ? "interior" : "exterior",
                                    brandId,
                                    modelId,
                                    currentRefs: currentWatchRefs,
                                    allowLegacyResave,
                                    movementMakerId,
                                    movementCaliberId,
                                    baseMovementMakerId,
                                    baseMovementCaliberId,
                                });

                                const syncedPart = await createOrUpdatePartsMaster({
                                    id: existingMaster.id,
                                    repairLinkedMaster: true,
                                    partType: item.partType ?? existingMaster.partType,
                                    category: item.category ?? existingMaster.category,
                                    subcategory: existingMaster.subcategory,
                                    standardPartNameId: validatedName.id,
                                    brandId: existingMaster.brandId,
                                    modelId: existingMaster.modelId,
                                    watchRefs: isInteriorPart ? existingMaster.watchRefs : mergeWatchRefs(existingMaster.watchRefs, currentWatchRefs),
                                    caliberId: existingMaster.caliberId,
                                    baseCaliberId: existingMaster.baseCaliberId,
                                    movementMakerId: existingMaster.movementMakerId,
                                    baseMakerId: existingMaster.baseMakerId,
                                    nameJp: item.name ?? existingMaster.nameJp,
                                    nameEn: existingMaster.nameEn,
                                    partRefs: item.partRef ?? existingMaster.partRefs,
                                    cousinsNumber: item.cousinsNumber ?? existingMaster.cousinsNumber,
                                    grade: item.grade ?? existingMaster.grade,
                                    notes1: item.note1 ?? existingMaster.notes1,
                                    notes2: item.note2 ?? existingMaster.notes2,
                                    size: existingMaster.size,
                                    photoKey: existingMaster.photoKey,
                                    costCurrency: existingMaster.costCurrency,
                                    costOriginal: existingMaster.costOriginal,
                                    latestCostYen: item.cost ?? existingMaster.latestCostYen,
                                    markupRate: existingMaster.markupRate,
                                    retailPrice: repairPartBasePrice({ ...item, price: item.price ?? existingMaster.retailPrice }, pricingTaxMode, existingMaster.retailPrice),
                                    // A repair form carries a display snapshot only. Never let it
                                    // overwrite live unreserved stock during a repair save.
                                    stockQuantity: existingMaster.stockQuantity,
                                    minStockAlert: existingMaster.minStockAlert,
                                    minStockAlertEnabled: existingMaster.minStockAlertEnabled,
                                    location: existingMaster.location,
                                    supplierId: existingMaster.supplierId,
                                }, tx as any);

                                return { ...item, partsMasterId: syncedPart.id };
                            }

                            const validatedName = await validateRepairPartItem(tx, item.standardPartNameId, null, {
                                partType: isInteriorPart ? "interior" : "exterior",
                                brandId,
                                modelId,
                                currentRefs: currentWatchRefs,
                                movementMakerId,
                                movementCaliberId,
                                baseMovementMakerId,
                                baseMovementCaliberId,
                            });
                            const syncedPart = await createOrUpdatePartsMaster({
                                partType: item.partType,
                                category: item.category,
                                standardPartNameId: validatedName.id,
                                standardNameCandidates: [validatedName.nameJa, validatedName.displayJa],
                                brandId,
                                modelId,
                                caliberId: isInteriorPart ? movementCaliberId : caliberId,
                                baseCaliberId: baseMovementCaliberId,
                                movementMakerId,
                                baseMakerId: baseMovementMakerId,
                                watchRefs: isInteriorPart
                                    ? productRef.name
                                    : currentWatchRefs,
                                nameJp: item.name,
                                nameEn: item.name,
                                partRefs: item.partRef,
                                cousinsNumber: item.cousinsNumber,
                                grade: item.grade,
                                notes1: item.note1,
                                notes2: item.note2,
                                latestCostYen: item.cost,
                                retailPrice: repairPartBasePrice(item, pricingTaxMode),
                                stockQuantity: item.stockQuantity ?? 0,
                            }, tx as any, { strictRepairIdentity: true });

                            return { ...item, partsMasterId: syncedPart.id };
                        }));

                        await tx.estimateItem.createMany({
                            data: syncedEstimateItems.map((item: any) => ({
                                ...estimateItemSnapshots(item),
                                estimateId: estimate.id,
                                itemName: item.name,
                                type: item.type,
                                unitPrice: Math.floor(Number(item.price) || 0),
                                quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
                                partsMasterId: item.partsMasterId ? Number(item.partsMasterId) : null,
                            }))
                        });

                        const repairLineItemInputs = estimateItemsLikeToRepairLineItemInputs(syncedEstimateItems).map((item) => ({
                            ...item,
                            relatedWorkLineItemId: null,
                        }));
                        await replaceRepairLineItems(id, repairLineItemInputs, tx);
                        await syncPricingRulesFromRepairLineItems(tx, {
                            brandId,
                            modelId,
                            caliberId,
                            customerType,
                            items: repairLineItemInputs,
                        });

                    } else {
                        await replaceRepairLineItems(id, [], tx);
                    }
                }
            }

            // Existing photos are updated in place and newly uploaded storage
            // objects are registered. Omitted photos are deliberately retained:
            // deleting a database record must remain an explicit future action.
            if (Array.isArray(body.photos)) {
                const existingPhotoIds = new Set((await tx.repairPhoto.findMany({
                    where: { repairId: id },
                    select: { id: true },
                })).map((photo) => photo.id));

                await Promise.all(body.photos.map((rawPhoto: any) => {
                    const category = repairPhotoCategory(rawPhoto.category);
                    const sharing = normalizePhotoSharing({
                        customerVisible: rawPhoto.customerVisible,
                        publicCaseVisible: rawPhoto.publicCaseVisible,
                        snsVisible: rawPhoto.snsVisible,
                    });
                    if (photoPostingOptOut) {
                        sharing.publicCaseVisible = false;
                        sharing.snsVisible = false;
                    }
                    const data = {
                        stage: repairPhotoStage(rawPhoto.stage),
                        category,
                        ...sharing,
                        fileName: rawPhoto.fileName || null,
                        mimeType: rawPhoto.mimeType || null,
                    };
                    const photoId = Number(rawPhoto.id);
                    if (Number.isInteger(photoId) && existingPhotoIds.has(photoId)) {
                        return tx.repairPhoto.update({ where: { id: photoId }, data });
                    }
                    if (!rawPhoto.storageKey || typeof rawPhoto.storageKey !== "string") {
                        return Promise.resolve(null);
                    }
                    return tx.repairPhoto.create({ data: { repairId: id, storageKey: rawPhoto.storageKey, ...data } });
                }));
            }

            updatedRepair = (await persistManualRepairStatus(tx, id, dbStatus, admin.id, statusDateUpdates.get(dbStatus))).repair;
            for (const [status, date] of statusDateUpdates) {
                if (status === dbStatus) continue;
                await correctManualStatusDate(tx, id, status, date, admin.id, updatedRepair.status);
            }

            if (statusDateUpdates.has("受付") && dbStatus !== "受付") {
                updatedRepair = await tx.repair.findUniqueOrThrow({ where: { id } });
            }

            return updatedRepair;
        }, {
            maxWait: 5000,
            timeout: 20000,
        });

        return NextResponse.json({ success: true, repair: result });
    } catch (error: any) {
        if (error instanceof TimepieceTypeError) return NextResponse.json({ error: error.message }, { status: 400 });
        if (error instanceof RepairPartValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error instanceof ManualStatusValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error("Update Error:", error);
        return NextResponse.json(
            { error: error.message || "予期せぬエラーが発生しました" },
            { status: 500 }
        );
    }
}

