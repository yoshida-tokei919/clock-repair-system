
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
                include: { watch: true }
            });

            if (!repairRecord) {
                throw new Error("Repair not found");
            }

            // 1. Update Watch Details
            if (body.watch) {
                let brand = await tx.brand.findUnique({ where: { name: body.watch.brand } });

                if (!brand) {
                    // Try to find brand by English or Japanese name as fallback
                    brand = await tx.brand.findFirst({
                        where: {
                            OR: [
                                { nameEn: body.watch.brand },
                                { nameJp: body.watch.brand }
                            ]
                        }
                    });
                }

                if (brand) {
                    // Find or Create Model
                    let modelId = repairRecord.watch.modelId;
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

                    // Find or Create Caliber
                    let caliberId = repairRecord.watch.caliberId;
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

                    // Handle WatchReference (Ref)
                    let referenceId = repairRecord.watch.referenceId;
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

                    // ALWAYS update watch details to ensure current form state is persisted
                    await tx.watch.update({
                        where: { id: repairRecord.watchId },
                        data: {
                            brandId: brand.id,
                            modelId: modelId,
                            referenceId: referenceId,
                            caliberId: caliberId,
                            serialNumber: body.watch.serial,
                        }
                    });
                }
            }

            // 1.5 Update Customer Details
            if (body.customer) {
                await tx.customer.update({
                    where: { id: repairRecord.customerId },
                    data: {
                        name: body.customer.name,
                        phone: body.customer.phone,
                        lineId: body.customer.lineId,
                        address: body.customer.address,
                        companyName: body.customer.type === 'business' ? body.customer.name : undefined
                    }
                });
            }

            // 2. Update Repair Fields
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

            const repair = await tx.repair.update({
                where: { id },
                data: {
                    status: dbStatus,
                    partnerRef: body.request?.partnerRef,
                    accessories: JSON.stringify(body.request?.accessories || []),
                    workSummary: body.request?.diagnosis,
                    internalNotes: body.request?.internalNotes,
                    endUserName: body.customer?.endUserName,
                }
            });

            // 3. Update Estimate Items
            if (body.estimate?.items) {
                await tx.estimateItem.deleteMany({
                    where: { estimate: { repairId: id } }
                });

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

                const estimate = await tx.estimate.findFirst({ where: { repairId: id } });
                if (estimate) {
                    await tx.estimateItem.createMany({
                        data: body.estimate.items.map((item: any) => ({
                            estimateId: estimate.id,
                            itemName: item.name,
                            type: item.type,
                            unitPrice: item.price,
                            quantity: 1
                        }))
                    });
                }

                // 3.5 Master Data Sync (New)
                // Need current watch info for context
                const watch = await tx.watch.findUnique({
                    where: { id: repairRecord.watchId },
                    include: { brand: true, model: true, caliber: true }
                });

                if (watch) {
                    for (const item of body.estimate.items) {
                        if (item.type === 'part') {
                            const existingPart = await tx.partsMaster.findFirst({
                                where: {
                                    nameJp: item.name,
                                    brandId: watch.brandId,
                                    modelId: watch.modelId,
                                    caliberId: watch.caliberId
                                }
                            });
                            if (!existingPart) {
                                await tx.partsMaster.create({
                                    data: {
                                        category: 'generic',
                                        brandId: watch.brandId,
                                        modelId: watch.modelId,
                                        caliberId: watch.caliberId,
                                        name: item.name,
                                        nameJp: item.name,
                                        nameEn: item.name,
                                        retailPrice: item.price,
                                        stockQuantity: 0,
                                    }
                                });
                            }
                        } else if (item.type === 'labor') {
                            const existingRule = await tx.pricingRule.findFirst({
                                where: {
                                    suggestedWorkName: item.name,
                                    brandId: watch.brandId,
                                    modelId: watch.modelId,
                                    caliberId: watch.caliberId
                                }
                            });
                            if (!existingRule) {
                                await tx.pricingRule.create({
                                    data: {
                                        suggestedWorkName: item.name,
                                        minPrice: item.price,
                                        maxPrice: item.price,
                                        brandId: watch.brandId,
                                        modelId: watch.modelId,
                                        caliberId: watch.caliberId
                                    }
                                });
                            }
                        }
                    }
                }
            }

            return repair;
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
