
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = parseInt(params.id);
        const body = await req.json();
        console.log("Updating Repair:", id, body);

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

                if (!brand) {
                    throw new Error(`ブランド名が確認できません: ${brandNameInput}`);
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

                // Sync Watch Record
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
                    }
                });
            }

            // 3. Update Repair Fields
            const statusMapping: Record<string, string> = {
                "reception": "reception",
                "diagnosing": "diagnosing",
                "parts_wait": "parts_wait",
                "parts_wait_ordered": "parts_wait_ordered",
                "in_progress": "in_progress",
                "completed": "completed",
                "delivered": "delivered",
                "canceled": "canceled"
            };
            const dbStatus = statusMapping[body.status] || body.status;

            const updatedRepair = await tx.repair.update({
                where: { id },
                data: {
                    status: dbStatus,
                    partnerRef: body.request?.partnerRef || null,
                    accessories: JSON.stringify(body.request?.accessories || []),
                    workSummary: body.request?.diagnosis || null,
                    internalNotes: body.request?.internalNotes || null,
                    endUserName: body.customer?.endUserName || null,
                }
            });

            // 4. Update Estimates
            if (body.estimate?.items) {
                const total = body.estimate.items.reduce((sum: number, item: any) => sum + item.price, 0);

                await tx.estimate.upsert({
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

                const estimate = await tx.estimate.findUnique({ where: { repairId: id } });
                if (estimate) {
                    await tx.estimateItem.deleteMany({ where: { estimateId: estimate.id } });
                    await tx.estimateItem.createMany({
                        data: body.estimate.items.map((item: any) => ({
                            estimateId: estimate.id,
                            itemName: item.name,
                            type: item.type,
                            unitPrice: item.price,
                            quantity: 1
                        }))
                    });

                    // 4.1 Master Sync
                    for (const item of body.estimate.items) {
                        if (item.type === 'part') {
                            const existingPart = await tx.partsMaster.findFirst({
                                where: { nameJp: item.name, brandId: brandId, modelId: modelId, caliberId: caliberId }
                            });
                            if (!existingPart) {
                                await tx.partsMaster.create({
                                    data: {
                                        category: 'generic',
                                        brandId: brandId,
                                        modelId: modelId,
                                        caliberId: caliberId,
                                        name: item.name,
                                        nameJp: item.name,
                                        retailPrice: item.price,
                                    }
                                });
                            }
                        } else if (item.type === 'labor') {
                            const existingRule = await tx.pricingRule.findFirst({
                                where: { suggestedWorkName: item.name, brandId: brandId, modelId: modelId, caliberId: caliberId }
                            });
                            if (!existingRule) {
                                await tx.pricingRule.create({
                                    data: {
                                        suggestedWorkName: item.name,
                                        minPrice: item.price,
                                        maxPrice: item.price,
                                        brandId: brandId,
                                        modelId: modelId,
                                        caliberId: caliberId
                                    }
                                });
                            }
                        }
                    }
                }
            }

            return updatedRepair;
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
