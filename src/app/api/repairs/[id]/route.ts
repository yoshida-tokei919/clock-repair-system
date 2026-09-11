
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canApplyPartsOrderStatus, getRepairStatusFromOrderStatuses, type RepairPartsOrderStatus } from "@/lib/repair-parts-status";
import { findOrCreateBrand, findOrCreateCaliber, resolveBrand } from "@/lib/master-normalize";
import { createOrUpdatePartsMaster } from "@/lib/parts-master";
import { estimateItemSnapshots } from "@/lib/estimate-item-snapshots";
import { syncPricingRulesFromRepairLineItems } from "@/lib/pricing-rules";
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = parseInt(params.id);
        const body = await req.json();
        console.log("Updating Repair:", id, body);

        // Increased timeout to 20 seconds to prevent "Transaction already closed" due to timeouts
        const result = await prisma.$transaction(async (tx) => {
            const repairRecord = await tx.repair.findUnique({
                where: { id },
                include: { watch: { include: { brand: true, model: true, caliber: true, reference: true } } }
            });

            if (!repairRecord) {
                throw new Error("修琁E��録が見つかりません");
            }

            let brandId = repairRecord.watch.brandId;
            let modelId = repairRecord.watch.modelId;
            let caliberId = repairRecord.watch.caliberId;
            let referenceId = repairRecord.watch.referenceId;
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

                const movementMakerInput = (body.watch.movementMaker || "").trim();
                if (movementMakerInput) {
                    const resolvedMovementMaker = await resolveBrand(tx as any, movementMakerInput);
                    if (!resolvedMovementMaker) throw new Error("ムーブメントメーカーは候補から選択してください。");
                    movementMakerId = (await findOrCreateBrand(tx as any, movementMakerInput, { isWatchBrand: false, isMovementMaker: true })).id;
                } else {
                    movementMakerId = null;
                }

                const movementCaliberInput = (body.watch.movementCaliber || "").trim();
                movementCaliberId = movementCaliberInput
                    ? (await findOrCreateCaliber(tx as any, movementCaliberInput, movementMakerId)).id
                    : null;

                const baseMovementMakerInput = (body.watch.baseMovementMaker || "").trim();
                if (baseMovementMakerInput) {
                    const resolvedBaseMovementMaker = await resolveBrand(tx as any, baseMovementMakerInput);
                    if (!resolvedBaseMovementMaker) throw new Error("ベースムーブメントメーカーは候補から選択してください。");
                    baseMovementMakerId = (await findOrCreateBrand(tx as any, baseMovementMakerInput, { isWatchBrand: false, isMovementMaker: true })).id;
                } else {
                    baseMovementMakerId = null;
                }

                const baseMovementCaliberInput = (body.watch.baseMovementCaliber || "").trim();
                baseMovementCaliberId = baseMovementCaliberInput
                    ? (await findOrCreateCaliber(tx as any, baseMovementCaliberInput, baseMovementMakerId)).id
                    : null;

                // Reference Handling
                if (body.watch.ref && modelId) {
                    const wr = await tx.watchReference.findFirst({
                        where: { modelId: modelId, name: body.watch.ref }
                    });
                    if (wr) {
                        referenceId = wr.id;
                    } else {
                        const newWr = await tx.watchReference.create({
                            data: {
                                modelId: modelId,
                                name: body.watch.ref,
                                caliberId: caliberId
                            }
                        });
                        referenceId = newWr.id;
                    }
                }

                // Sync Watch Record (Always refresh to avoid "-" display)
                await tx.watch.update({
                    where: { id: repairRecord.watchId },
                    data: {
                        brandId: brandId,
                        modelId: modelId,
                        referenceId: referenceId,
                        caliberId: caliberId,
                        serialNumber: body.watch.serial || null,
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
            const dbStatus = requestedStatus === "受付" && hasEstimateItems ? "見積中" : requestedStatus;
            const rawEndUserName = body.customer?.endUserName ?? body.request?.endUserName ?? null;
            const endUserName = rawEndUserName && String(rawEndUserName).trim() ? String(rawEndUserName).trim() : null;
            const photoPostingOptOut = typeof body.photoPostingOptOut === "boolean"
                ? body.photoPostingOptOut
                : repairRecord.photoPostingOptOut;

            let updatedRepair = await tx.repair.update({
                where: { id },
                data: {
                    status: dbStatus,
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

            // RepairStatusLog: スチE�Eタスが変化した場合�Eみ記録
            if (hasEstimateItems && dbStatus === "見積中") {
                const receptionLog = await tx.repairStatusLog.findFirst({
                    where: { repairId: id, status: "受付" }
                });
                if (!receptionLog) {
                    await tx.repairStatusLog.create({
                        data: { repairId: id, status: "受付", changedAt: repairRecord.createdAt }
                    });
                }
                const logDateStr = body.statusLog?.[dbStatus];
                let changedAt = new Date();
                if (logDateStr) {
                    const parts = logDateStr.split('/');
                    if (parts.length === 3) {
                        changedAt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                }
                const existingStatusLog = await tx.repairStatusLog.findFirst({
                    where: { repairId: id, status: dbStatus }
                });
                if (!existingStatusLog) {
                    await tx.repairStatusLog.create({
                        data: { repairId: id, status: dbStatus, changedAt }
                    });
                }
            } else if (dbStatus !== repairRecord.status) {
                const logDateStr = body.statusLog?.[dbStatus];
                let changedAt = new Date();
                if (logDateStr) {
                    const parts = logDateStr.split('/');
                    if (parts.length === 3) {
                        changedAt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                }
                const existingStatusLog = await tx.repairStatusLog.findFirst({
                    where: { repairId: id, status: dbStatus }
                });
                if (!existingStatusLog) {
                    await tx.repairStatusLog.create({
                        data: { repairId: id, status: dbStatus, changedAt }
                    });
                }
            }

            // 4. Update Estimates
            if (body.estimate?.items) {
                const total = body.estimate.items.reduce(
                    (sum: number, item: any) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)),
                    0
                );
                const techFee = body.estimate.items
                    .filter((item: any) => item.type === 'labor')
                    .reduce((sum: number, item: any) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
                const partsFee = body.estimate.items
                    .filter((item: any) => item.type === 'part')
                    .reduce((sum: number, item: any) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
                const taxAmount = Math.floor(total * 0.1);

                // Use the returned estimate from upsert directly
                const estimate = await tx.estimate.upsert({
                    where: { repairId: id },
                    create: {
                        repairId: id,
                        technicalFee: techFee,
                        partsTotal: partsFee,
                        totalAmount: total,
                        taxAmount,
                    },
                    update: {
                        technicalFee: techFee,
                        partsTotal: partsFee,
                        totalAmount: total,
                        taxAmount,
                    }
                });

                if (estimate) {
                    // Transaction-safe deletion and creation
                    await tx.estimateItem.deleteMany({ where: { estimateId: estimate.id } });

                    if (body.estimate.items.length > 0) {
                        const syncedEstimateItems = await Promise.all(body.estimate.items.map(async (item: any) => {
                            if (item.type !== 'part') return item;
                            const isInteriorPart = item.partType === 'interior'
                                || item.category === 'internal'
                                || item.category === 'part_internal';

                            if (item.partsMasterId) {
                                const existingMaster = await tx.partsMaster.findUnique({ where: { id: Number(item.partsMasterId) } });
                                if (!existingMaster) return item;

                                const syncedPart = await createOrUpdatePartsMaster({
                                    id: existingMaster.id,
                                    partType: item.partType ?? existingMaster.partType,
                                    category: item.category ?? existingMaster.category,
                                    subcategory: existingMaster.subcategory,
                                    brandId: existingMaster.brandId,
                                    modelId: existingMaster.modelId,
                                    watchRefs: existingMaster.watchRefs,
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
                                    retailPrice: item.price ?? existingMaster.retailPrice,
                                    stockQuantity: item.stockQuantity ?? existingMaster.stockQuantity,
                                    minStockAlert: existingMaster.minStockAlert,
                                    minStockAlertEnabled: existingMaster.minStockAlertEnabled,
                                    location: existingMaster.location,
                                    supplierId: existingMaster.supplierId,
                                }, tx as any);

                                return { ...item, partsMasterId: syncedPart.id };
                            }

                            const syncedPart = await createOrUpdatePartsMaster({
                                partType: item.partType,
                                category: item.category,
                                brandId,
                                modelId,
                                caliberId: isInteriorPart ? movementCaliberId : caliberId,
                                baseCaliberId: baseMovementCaliberId,
                                movementMakerId,
                                baseMakerId: baseMovementMakerId,
                                watchRefs: body.watch?.ref || repairRecord.watch.reference?.name || null,
                                nameJp: item.name,
                                nameEn: item.name,
                                partRefs: item.partRef,
                                cousinsNumber: item.cousinsNumber,
                                grade: item.grade,
                                notes1: item.note1,
                                notes2: item.note2,
                                latestCostYen: item.cost,
                                retailPrice: item.price,
                                stockQuantity: item.stockQuantity ?? 0,
                            }, tx as any);

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

                        const pendingOrderQuantities = new Map<number, number>();
                        for (const item of syncedEstimateItems) {
                            if (item.type !== 'part' || !item.partsMasterId) continue;
                            const partId = Number(item.partsMasterId);
                            const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
                            pendingOrderQuantities.set(partId, (pendingOrderQuantities.get(partId) ?? 0) + quantity);
                        }

                        for (const [partsMasterId, quantity] of Array.from(pendingOrderQuantities.entries())) {
                            await tx.orderRequest.updateMany({
                                where: {
                                    repairId: id,
                                    partsMasterId,
                                    status: 'pending',
                                },
                                data: { quantity },
                            });
                        }
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

            const repairOrders = await tx.orderRequest.findMany({
                where: {
                    repairId: id,
                    status: { in: ['pending', 'ordered', 'received'] }
                },
                select: { status: true }
            });
            const aggregatedRepairStatus = getRepairStatusFromOrderStatuses(
                repairOrders.map(order => order.status as RepairPartsOrderStatus)
            );
            if (
                aggregatedRepairStatus &&
                aggregatedRepairStatus !== updatedRepair.status &&
                canApplyPartsOrderStatus(updatedRepair.status)
            ) {
                updatedRepair = await tx.repair.update({
                    where: { id },
                    data: { status: aggregatedRepairStatus }
                });
            }

            return updatedRepair;
        }, {
            timeout: 5000
        });

        return NextResponse.json({ success: true, repair: result });
    } catch (error: any) {
        console.error("Update Error:", error);
        return NextResponse.json(
            { error: error.message || "予期せぬエラーが発生しました" },
            { status: 500 }
        );
    }
}

