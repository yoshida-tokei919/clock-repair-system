
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
                throw new Error("修理記録が見つかりません");
            }

            let brandId = repairRecord.watch.brandId;
            let modelId = repairRecord.watch.modelId;
            let caliberId = repairRecord.watch.caliberId;
            let referenceId = repairRecord.watch.referenceId;

            // 1. Update Watch Details (Smart Match)
            if (body.watch) {
                const brandNameInput = body.watch.brand;
                let brand = await tx.brand.findFirst({
                    where: {
                        OR: [
                            { name: brandNameInput },
                            { nameEn: brandNameInput },
                            { nameJp: brandNameInput }
                        ]
                    }
                });

                // Composite fallback "ROLEX ロレックス"
                if (!brand && brandNameInput) {
                    const parts = brandNameInput.split(/[\s/／]+/);
                    brand = await tx.brand.findFirst({
                        where: {
                            OR: [
                                { name: { in: parts } },
                                { nameEn: { in: parts } },
                                { nameJp: { in: parts } }
                            ]
                        }
                    });
                }

                // ブランドが見つからなければ自動作成（POST側と同様）
                if (!brand && brandNameInput) {
                    brand = await tx.brand.create({
                        data: { name: brandNameInput, nameJp: brandNameInput, nameEn: brandNameInput }
                    });
                }
                if (!brand) {
                    throw new Error("ブランド名が入力されていません");
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
                    const cal = await tx.caliber.findFirst({
                        where: {
                            OR: [
                                { name: body.watch.caliber },
                                { nameEn: body.watch.caliber },
                                { nameJp: body.watch.caliber }
                            ]
                        }
                    });
                    if (cal) {
                        caliberId = cal.id;
                    } else {
                        const newCal = await tx.caliber.create({
                            data: { name: body.watch.caliber, brandId: brand.id }
                        });
                        caliberId = newCal.id;
                    }
                }

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

            const updatedRepair = await tx.repair.update({
                where: { id },
                data: {
                    status: dbStatus,
                    partnerRef: body.request?.partnerRef || null,
                    accessories: JSON.stringify(body.request?.accessories || []),
                    workSummary: body.request?.diagnosis || null,
                    internalNotes: body.request?.internalNotes || null,
                    customerNote: body.request?.customerNote ?? null,
                    endUserName: body.customer?.endUserName || null,
                }
            });

            // RepairStatusLog: ステータスが変化した場合のみ記録
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
                        await tx.estimateItem.createMany({
                            data: body.estimate.items.map((item: any) => ({
                                estimateId: estimate.id,
                                itemName: item.name,
                                type: item.type,
                                unitPrice: Math.floor(Number(item.price) || 0),
                                quantity: 1,
                                partsMasterId: item.partsMasterId ? Number(item.partsMasterId) : null,
                            }))
                        });
                    }

                    // 4.1 Master Sync (Batched: 2クエリで完結、N+1解消)
                    const partItems = body.estimate.items.filter((i: any) => i.type === 'part');
                    const laborItems = body.estimate.items.filter((i: any) => i.type === 'labor');

                    if (partItems.length > 0) {
                        const partNames = partItems.map((i: any) => i.name);
                        const existingParts = await tx.partsMaster.findMany({
                            where: { nameJp: { in: partNames }, brandId, modelId, caliberId },
                            select: { nameJp: true }
                        });
                        const existingPartNames = new Set(existingParts.map((p: any) => p.nameJp));
                        // 新規登録
                        const newParts = partItems.filter((i: any) => !existingPartNames.has(i.name));
                        if (newParts.length > 0) {
                            await tx.partsMaster.createMany({
                                data: newParts.map((item: any) => ({
                                    category: 'generic',
                                    brandId, modelId, caliberId,
                                    name: item.name, nameJp: item.name,
                                    retailPrice: Math.floor(Number(item.price) || 0),
                                    stockQuantity: 0,
                                }))
                            });
                        }
                        // 既存エントリの上代を更新（§3：自動登録・更新）
                        for (const item of partItems) {
                            if (existingPartNames.has(item.name)) {
                                await tx.partsMaster.updateMany({
                                    where: { nameJp: item.name, brandId, modelId, caliberId },
                                    data: { retailPrice: Math.floor(Number(item.price) || 0) }
                                });
                            }
                        }
                    }

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
                        // 既存エントリの料金を更新（§3：自動登録・更新）
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
