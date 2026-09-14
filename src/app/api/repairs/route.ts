
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addConfirmedRepairStatusLog, reconcileRepairPartAllocations } from "@/lib/repair-part-allocation";
import { findOrCreateBrand, findOrCreateCaliber, resolveBrand } from "@/lib/master-normalize";
import { createOrUpdatePartsMaster } from "@/lib/parts-master";
import { estimateItemSnapshots } from "@/lib/estimate-item-snapshots";
import { syncPricingRulesFromRepairLineItems } from "@/lib/pricing-rules";
import {
    estimateItemsLikeToRepairLineItemInputs,
    replaceRepairLineItems,
} from "@/lib/repair-line-items";
import {
    photoSharingFallbacks,
    repairPhotoCategory,
    repairPhotoStage,
} from "@/lib/repair-photo-sharing";

function extractInquirySequence(inquiryNumber: string | null, prefix: string) {
    if (!inquiryNumber) return 0;
    const prefixWithSeparator = `${prefix}-`;
    if (!inquiryNumber.startsWith(prefixWithSeparator)) return 0;
    const seq = Number(inquiryNumber.slice(prefixWithSeparator.length));
    return Number.isFinite(seq) ? seq : 0;
}

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

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const result = await prisma.$transaction(async (tx) => {
            // 1. Customer Handling
            let customerId = body.customer.id ? parseInt(body.customer.id) : null;
            let customer;

            if (customerId) {
                customer = await tx.customer.findUnique({ where: { id: customerId } });
            }

            if (!customer) {
                const type = requireCustomerType(body.customer.type);
                const name = (body.customer.name || "").trim();
                const companyName = (body.customer.companyName || name).trim();

                if (type === 'business') {
                    const businessName = companyName || name;
                    // B2B: Match by Name (be more aggressive to avoid duplicates)
                    customer = await tx.customer.findFirst({
                        where: {
                            type: 'business',
                            OR: [
                                { name: businessName },
                                { companyName: businessName }
                            ]
                        }
                    });

                    if (!customer) {
                        // Create New B2B
                        const prefix = (body.customer.prefix || "").trim().toUpperCase();
                        if (!prefix) {
                            throw new Error("業者登録ではプレフィックスを入力してください。");
                        }
                        const existingPrefixCustomer = await tx.customer.findFirst({
                            where: { type: 'business', prefix }
                        });
                        if (existingPrefixCustomer) {
                            throw new Error("このプレフィックスは既に使用されています。別のプレフィックスを指定してください。");
                        }

                        customer = await tx.customer.create({
                            data: {
                                type: 'business',
                                isPartner: true,
                                name: name || businessName,
                                companyName: businessName,
                                prefix: prefix,
                                currentSeq: 0,
                                address: body.customer.address,
                                email: body.customer.email,
                                phone: body.customer.phone
                            }
                        });
                    }
                } else {
                    // B2C: Match by Phone OR Name
                    const phone = (body.customer.phone || "").trim();

                    if (phone) {
                        customer = await tx.customer.findFirst({
                            where: { phone: phone, type: 'individual' }
                        });
                    }

                    if (!customer && name) {
                        // Match by Name if phone didn't work or wasn't provided
                        customer = await tx.customer.findFirst({
                            where: { name: name, type: 'individual' }
                        });
                    }

                    if (customer) {
                        // Update existing customer info (address/email/phone/lineId if provided)
                        customer = await tx.customer.update({
                            where: { id: customer.id },
                            data: {
                                address: body.customer.address || customer.address,
                                email: body.customer.email || customer.email,
                                phone: body.customer.phone || customer.phone,
                                lineId: body.customer.lineId || customer.lineId,
                            }
                        });
                    } else {
                        // Create New B2C
                        customer = await tx.customer.create({
                            data: {
                                type: 'individual',
                                name: name,
                                prefix: 'C',
                                isPartner: false,
                                currentSeq: 9999,
                                rank: 1,
                                phone: phone || null,
                                lineId: body.customer.lineId || null,
                                address: body.customer.address,
                                email: body.customer.email,
                            },
                        });
                    }
                }
                customerId = customer.id;
            }

            // 2. Watch Handling (Simplified matching)
            // 2. Watch Handling (Simplified matching)
            const brandNameInput = body.watch.brand;
            const brand = brandNameInput ? await resolveBrand(tx as any, brandNameInput) : null;

            if (!brand) {
                throw new Error("繝悶Λ繝ｳ繝牙錐縺鯉ｿｽE蜉帙＆繧後※縺・・ｽ・ｽ縺帙ｓ");
            }

            let watch;
            const serialInput = body.watch.serial || null;

            if (serialInput) {
                // If serial exists, try to find match
                // Note: unique constraint removed, so using findFirst
                watch = await tx.watch.findFirst({
                    where: { brandId: brand.id, serialNumber: serialInput }
                });
            }

            // Find Model (Fallback to 'Unknown' or ID 1 if not found)
            let modelId: number;
            const modelNameInput = body.watch.model || "Unknown Model";

            const model = await tx.model.findFirst({
                where: {
                    brandId: brand.id,
                    OR: [
                        { name: modelNameInput },
                        { nameEn: modelNameInput },
                        { nameJp: modelNameInput }
                    ]
                }
            });

            if (model) {
                modelId = model.id;
            } else {
                // Create New Model dynamically
                const newModel = await tx.model.create({
                    data: {
                        brandId: brand.id,
                        name: modelNameInput,
                        nameJp: modelNameInput,
                    }
                });
                modelId = newModel.id;
            }

            // Handle Caliber
            let caliberId: number | null = null;
            const caliberInput = body.watch.caliber;
            if (caliberInput) {
                const cal = await findOrCreateCaliber(tx as any, caliberInput, brand.id);
                caliberId = cal.id;
            }

            let movementMakerId: number | null = null;
            const movementMakerInput = (body.watch.movementMaker || "").trim();
            if (movementMakerInput) {
                const resolvedMovementMaker = await resolveBrand(tx as any, movementMakerInput);
                if (!resolvedMovementMaker) throw new Error("ムーブメントメーカーは候補から選択してください。");
                const movementMaker = await findOrCreateBrand(tx as any, movementMakerInput, { isWatchBrand: false, isMovementMaker: true });
                movementMakerId = movementMaker.id;
            }

            let movementCaliberId: number | null = null;
            const movementCaliberInput = (body.watch.movementCaliber || "").trim();
            if (movementCaliberInput) {
                const movementCaliber = await findOrCreateCaliber(tx as any, movementCaliberInput, movementMakerId);
                movementCaliberId = movementCaliber.id;
            }

            let baseMovementMakerId: number | null = null;
            const baseMovementMakerInput = (body.watch.baseMovementMaker || "").trim();
            if (baseMovementMakerInput) {
                const resolvedBaseMovementMaker = await resolveBrand(tx as any, baseMovementMakerInput);
                if (!resolvedBaseMovementMaker) throw new Error("ベースムーブメントメーカーは候補から選択してください。");
                const baseMovementMaker = await findOrCreateBrand(tx as any, baseMovementMakerInput, { isWatchBrand: false, isMovementMaker: true });
                baseMovementMakerId = baseMovementMaker.id;
            }

            let baseMovementCaliberId: number | null = null;
            const baseMovementCaliberInput = (body.watch.baseMovementCaliber || "").trim();
            if (baseMovementCaliberInput) {
                const baseMovementCaliber = await findOrCreateCaliber(tx as any, baseMovementCaliberInput, baseMovementMakerId);
                baseMovementCaliberId = baseMovementCaliber.id;
            }

            // Handle WatchReference
            let referenceId: number | null = null;
            const refNameInput = body.watch.ref;
            if (refNameInput) {
                const wr = await tx.watchReference.findFirst({
                    where: { modelId: modelId, name: refNameInput }
                });
                if (wr) {
                    referenceId = wr.id;
                    // If caliberId was not set, use the one from reference if available
                    if (!caliberId && wr.caliberId) {
                        caliberId = wr.caliberId;
                    }
                } else {
                    // Create new reference and link to current caliber
                    const newWr = await tx.watchReference.create({
                        data: {
                            modelId: modelId,
                            name: refNameInput,
                            caliberId: caliberId
                        }
                    });
                    referenceId = newWr.id;
                }
            }

            if (!watch) {
                // Create new watch if not found or if no serial provided (always new for no-serial?)
                watch = await tx.watch.create({
                    data: {
                        brandId: brand.id,
                        modelId: modelId,
                        referenceId: referenceId,
                        caliberId: caliberId,
                        serialNumber: serialInput, // Can be null
                        customerId: customerId!,
                    }
                });
            } else {
                // FORCE update watch metadata to ensure data persistence
                // (Previously it was skipping if already set, causing "-" issues)
                await tx.watch.update({
                    where: { id: watch.id },
                    data: {
                        brandId: brand.id,
                        modelId: modelId,
                        referenceId: referenceId,
                        caliberId: caliberId,
                        serialNumber: serialInput
                    }
                });
            }

            // 3. Inquiry Number Generation (The Core Logic)
            let inquiryNumber = "";
            let partnerRef = body.request.partnerRef || null;

            const customerPrefix = customer.type === 'individual'
                ? 'C'
                : (customer.prefix || "").toUpperCase();
            if (!customerPrefix) {
                throw new Error("業者登録ではプレフィックスを入力してください。");
            }
            const existingRepairsForPrefix = await tx.repair.findMany({
                where: { inquiryNumber: { startsWith: `${customerPrefix}-` } },
                select: { inquiryNumber: true },
            });
            const maxExistingSeq = existingRepairsForPrefix.reduce(
                (max, repair) => Math.max(max, extractInquirySequence(repair.inquiryNumber, customerPrefix)),
                0
            );
            const nextSeq = Math.max(customer.currentSeq || 0, maxExistingSeq) + 1;
            inquiryNumber = `${customerPrefix}-${String(nextSeq).padStart(3, '0')}`;

            await tx.customer.update({
                where: { id: customer.id },
                data: {
                    currentSeq: nextSeq,
                    prefix: customer.prefix || customerPrefix,
                }
            });

            // 4. Create Repair
            const hasEstimateItems = Array.isArray(body.estimate?.items) && body.estimate.items.length > 0;
            const requestedStatus = body.status || "受付";
            const dbStatus = requestedStatus === "受付" && hasEstimateItems ? "見積中" : requestedStatus;
            const rawEndUserName = body.customer?.endUserName ?? body.request?.endUserName ?? null;
            const endUserName = rawEndUserName && String(rawEndUserName).trim() ? String(rawEndUserName).trim() : null;

            const repair = await tx.repair.create({
                data: {
                    inquiryNumber,
                    customerId: customer.id,
                    watchId: watch.id,
                    movementMakerId,
                    movementCaliberId,
                    baseMovementMakerId,
                    baseMovementCaliberId,
                    partnerRef,
                    status: dbStatus,
                    accessories: JSON.stringify(body.request.accessories || []),
                    workSummary: body.request.diagnosis,
                    internalNotes: body.request.internalNotes,
                    customerNote: body.request.customerNote || null,
                    estimatedWorkMinutes: 0,
                    endUserName,
                }
            });

            // 5. initial Log & History logs
            const partsDerivedStatuses = new Set([
                "部品待ち(未注文)",
                "部品待ち(注文済み)",
                "部品入荷済み",
                "作業待ち",
            ]);
            const logEntries = Object.entries(body.statusLog || {}).filter(([status]) => !partsDerivedStatuses.has(status));
            const loggedStatuses = new Set<string>();
            for (const [sId, dateStr] of logEntries) {
                await tx.repairStatusLog.create({
                    data: {
                        repairId: repair.id,
                        status: sId,
                        changedAt: new Date(dateStr as string),
                        changedBy: 1 // Admin
                    }
                });
                loggedStatuses.add(sId);
            }

            if (logEntries.length === 0) {
                // Fallback if no log provided
                await tx.repairStatusLog.create({
                    data: {
                        repairId: repair.id,
                        status: "受付",
                        changedBy: 1 // Admin
                    }
                });
                loggedStatuses.add("受付");
            }

            if (dbStatus !== "受付" && !partsDerivedStatuses.has(dbStatus) && !loggedStatuses.has(dbStatus)) {
                await tx.repairStatusLog.create({
                    data: {
                        repairId: repair.id,
                        status: dbStatus,
                        changedBy: 1 // Admin
                    }
                });
            }

            // 5.5 Create Photos (New)
            const photoList = body.photos || [];
            if (photoList.length > 0) {
                await Promise.all(photoList.map(async (p: any) => {
                    const category = repairPhotoCategory(p.category);
                    const preset = await tx.photoSharingDefault.findUnique({ where: { category } });
                    const sharing = preset ?? photoSharingFallbacks[category];
                    return tx.repairPhoto.create({
                        data: {
                            repairId: repair.id,
                            stage: repairPhotoStage(p.stage),
                            category,
                            customerVisible: sharing.customerVisible,
                            publicCaseVisible: sharing.publicCaseVisible,
                            snsVisible: sharing.snsVisible,
                            storageKey: p.storageKey,
                            fileName: p.fileName,
                            mimeType: p.mimeType,
                        }
                    });
                }));
            }

            // 6. Create Estimate (if items exist)
            let estimateItems = body.estimate?.items || [];
            if (estimateItems.length > 0) {
                estimateItems = await Promise.all(estimateItems.map(async (item: any) => {
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

                    const syncedPart = await createOrUpdatePartsMaster({
                        partType: item.partType,
                        category: item.category,
                        brandId: brand.id,
                        modelId,
                        caliberId: isInteriorPart ? movementCaliberId : caliberId,
                        baseCaliberId: baseMovementCaliberId,
                        movementMakerId,
                        baseMakerId: baseMovementMakerId,
                        watchRefs: refNameInput || null,
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

                const total = estimateItems.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
                const techFee = estimateItems.filter((i: any) => i.type === 'labor').reduce((sum: number, i: any) => sum + (Number(i.price) || 0), 0);
                const partsFee = estimateItems.filter((i: any) => i.type === 'part').reduce((sum: number, i: any) => sum + (Number(i.price) || 0), 0);

                await tx.estimate.create({
                    data: {
                        repairId: repair.id,
                        totalAmount: total,
                        technicalFee: techFee,
                        partsTotal: partsFee,
                        taxAmount: Math.floor(total * 0.1),
                        items: {
                            create: estimateItems.map((item: any) => ({
                                ...estimateItemSnapshots(item),
                                itemName: item.name,
                                type: item.type,
                                unitPrice: Math.floor(Number(item.price) || 0),
                                quantity: item.quantity || 1,
                                partsMasterId: item.partsMasterId ? Number(item.partsMasterId) : null,
                            }))
                        }
                    }
                });

                const repairLineItemInputs = estimateItemsLikeToRepairLineItemInputs(estimateItems).map((item) => ({
                    ...item,
                    relatedWorkLineItemId: null,
                }));
                await replaceRepairLineItems(repair.id, repairLineItemInputs, tx);

                try {
                    await syncPricingRulesFromRepairLineItems(tx, {
                        brandId: brand.id,
                        modelId,
                        caliberId,
                        customerType: requireCustomerType(customer.type),
                        items: repairLineItemInputs,
                    });
                } catch (error) {
                    console.error("Failed to sync pricing rules during repair create:", error);
                    throw error;
                }

            }

            // 7. 蝨ｨ蠎ｫ繝√ぉ繝・・ｽ・ｽ・ｽE・ｽEartsMasterId 縺後≠繧矩Κ蜩・ｿｽE縺ｿ・ｽE・ｽE
            const reconciliation = await reconcileRepairPartAllocations(tx, repair.id, {
                requestedStatus: dbStatus,
            });
            await addConfirmedRepairStatusLog(tx, repair.id, reconciliation.status);
            const finalRepair = reconciliation.status === repair.status
                ? repair
                : await tx.repair.findUniqueOrThrow({ where: { id: repair.id } });
            const stockWarnings: never[] = [];

            // 6. Return Data
            return { repair: finalRepair, stockWarnings };
        }, {
            maxWait: 5000,
            timeout: 20000,
        });

        return NextResponse.json({ success: true, repair: result.repair, stockWarnings: result.stockWarnings });
    } catch (error: any) {
        console.error("Transaction Error:", error);
        // Write error to file for debugging
        const fs = require('fs');
        fs.writeFileSync('server_error.txt', `${new Date().toISOString()} - ${error.message}\n${JSON.stringify(error, null, 2)}\n`);

        return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
    }
}

