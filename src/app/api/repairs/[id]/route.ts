
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRepairStatusFromOrderStatuses, type RepairPartsOrderStatus } from "@/lib/repair-parts-status";
import { findOrCreateBrand, findOrCreateCaliber } from "@/lib/master-normalize";
import { createOrUpdatePartsMaster } from "@/lib/parts-master";

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
                const brand = brandNameInput ? await findOrCreateBrand(tx as any, brandNameInput) : null;
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
                movementMakerId = movementMakerInput
                    ? (await findOrCreateBrand(tx as any, movementMakerInput)).id
                    : null;

                const movementCaliberInput = (body.watch.movementCaliber || "").trim();
                movementCaliberId = movementCaliberInput
                    ? (await findOrCreateCaliber(tx as any, movementCaliberInput, movementMakerId)).id
                    : null;

                const baseMovementMakerInput = (body.watch.baseMovementMaker || "").trim();
                baseMovementMakerId = baseMovementMakerInput
                    ? (await findOrCreateBrand(tx as any, baseMovementMakerInput)).id
                    : null;

                const baseMovementCaliberInput = (body.watch.baseMovementCaliber || "").trim();
                baseMovementCaliberId = baseMovementCaliberInput
                    ? (await findOrCreateCaliber(tx as any, baseMovementCaliberInput, baseMovementMakerId)).id
                    : null;

                // Reference Handling
                if (body.watch.ref) {
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
            if (body.customer) {
                await tx.customer.update({
                    where: { id: repairRecord.customerId },
                    data: {
                        name: body.customer.name,
                        phone: body.customer.phone || null,
                        lineId: body.customer.lineId || null,
                        address: body.customer.address || null,
                        companyName: body.customer.type === 'business' ? body.customer.name : undefined
                    }
                });
            }

            // 3. Update Repair Fields
            const dbStatus = body.status;

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
                    endUserName: body.customer?.endUserName || null,
                }
            });

            // RepairStatusLog: スチE�Eタスが変化した場合�Eみ記録
            if (dbStatus !== repairRecord.status) {
                const logDateStr = body.statusLog?.[dbStatus];
                let changedAt = new Date();
                if (logDateStr) {
                    const parts = logDateStr.split('/');
                    if (parts.length === 3) {
                        changedAt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                }
                await tx.repairStatusLog.create({
                    data: { repairId: id, status: dbStatus, changedAt }
                });
            }

            // 4. Update Estimates
            if (body.estimate?.items) {
                const total = body.estimate.items.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);

                // Use the returned estimate from upsert directly
                const estimate = await tx.estimate.upsert({
                    where: { repairId: id },
                    create: {
                        repairId: id,
                        totalAmount: total,
                        taxAmount: Math.floor(total * 0.1),
                    },
                    update: {
                        totalAmount: total,
                        taxAmount: Math.floor(total * 0.1),
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
                                estimateId: estimate.id,
                                itemName: item.name,
                                type: item.type,
                                unitPrice: Math.floor(Number(item.price) || 0),
                                quantity: 1,
                                partsMasterId: item.partsMasterId ? Number(item.partsMasterId) : null,
                            }))
                        });
                    }
                    const laborItems = body.estimate.items.filter((i: any) => i.type === 'labor');

                    if (laborItems.length > 0) {
                        const laborNames = laborItems.map((i: any) => i.name);
                        const existingRules = await tx.pricingRule.findMany({
                            where: { suggestedWorkName: { in: laborNames }, brandId, modelId, caliberId },
                            select: { suggestedWorkName: true }
                        });
                        const existingRuleNames = new Set(existingRules.map((r: any) => r.suggestedWorkName));
                        // 新規登録
                        const newRules = laborItems.filter((i: any) => !existingRuleNames.has(i.name));
                        if (newRules.length > 0) {
                            await tx.pricingRule.createMany({
                                data: newRules.map((item: any) => ({
                                    suggestedWorkName: item.name,
                                    minPrice: Math.floor(Number(item.price) || 0),
                                    maxPrice: Math.floor(Number(item.price) || 0),
                                    brandId, modelId, caliberId
                                }))
                            });
                        }
                        // 既存エントリの料��を更新�E�§3�E��E動登録・更新�E�E
                        for (const item of laborItems) {
                            if (existingRuleNames.has(item.name)) {
                                await tx.pricingRule.updateMany({
                                    where: { suggestedWorkName: item.name, brandId, modelId, caliberId },
                                    data: {
                                        minPrice: Math.floor(Number(item.price) || 0),
                                        maxPrice: Math.floor(Number(item.price) || 0),
                                    }
                                });
                            }
                        }
                    }
                }
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
            if (aggregatedRepairStatus && aggregatedRepairStatus !== updatedRepair.status) {
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

