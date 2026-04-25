
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRepairStatusFromOrderStatuses, type RepairPartsOrderStatus } from "@/lib/repair-parts-status";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log("Received Repair Create Request:", body);

        const result = await prisma.$transaction(async (tx) => {
            // 1. Customer Handling
            let customerId = body.customer.id ? parseInt(body.customer.id) : null;
            let customer;

            if (customerId) {
                customer = await tx.customer.findUnique({ where: { id: customerId } });
            }

            if (!customer) {
                const type = body.customer.type || 'individual';
                const name = (body.customer.name || "").trim();

                if (type === 'business') {
                    // B2B: Match by Name (be more aggressive to avoid duplicates)
                    customer = await tx.customer.findFirst({
                        where: { name: name, type: 'business' }
                    });

                    if (!customer) {
                        // Create New B2B
                        const prefix = body.customer.prefix || name.slice(0, 2).toUpperCase();
                        customer = await tx.customer.create({
                            data: {
                                type: 'business',
                                isPartner: true,
                                name: name,
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
                                isPartner: true, // Personal is also "partner" for C-001 logic
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
            let brand = await tx.brand.findUnique({ where: { name: brandNameInput } });

            if (!brand) {
                brand = await tx.brand.findFirst({
                    where: {
                        OR: [
                            { name: brandNameInput },
                            { nameEn: brandNameInput },
                            { nameJp: brandNameInput },
                        ]
                    }
                });
            }

            // Extreme fallback: Handle composite names like "ROLEX ロレックス"
            if (!brand && brandNameInput) {
                const parts = brandNameInput.split(/[\s/／]+/); // Split by space or slash
                if (parts.length > 0) {
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
            }

            // ブランドが見つからなければ自動作成（モデル・キャリバーと同様）
            if (!brand && brandNameInput) {
                brand = await tx.brand.create({
                    data: {
                        name: brandNameInput,
                        nameJp: brandNameInput,
                        nameEn: brandNameInput,
                    }
                });
            }

            if (!brand) {
                throw new Error("ブランド名が入力されていません");
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
                const cal = await tx.caliber.findFirst({
                    where: {
                        OR: [
                            { name: caliberInput },
                            { nameEn: caliberInput },
                            { nameJp: caliberInput }
                        ]
                    }
                });
                if (cal) {
                    caliberId = cal.id;
                } else {
                    const newCal = await tx.caliber.create({
                        data: { name: caliberInput, brandId: brand.id }
                    });
                    caliberId = newCal.id;
                }
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

            if (customer.isPartner && customer.prefix) {
                // B2B Logic: "T-101"
                const nextSeq = customer.currentSeq + 1;
                inquiryNumber = `${customer.prefix}-${String(nextSeq).padStart(3, '0')}`;

                // Increment Partner Seq
                await tx.customer.update({
                    where: { id: customer.id },
                    data: { currentSeq: nextSeq }
                });
            } else {
                // B2C Logic: "2026-0001" (Year + Global Seq)
                // Better: count today's repairs?
                const count = await tx.repair.count();
                inquiryNumber = `R-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
            }

            // 4. Create Repair
            const dbStatus = body.status || "受付";

            const repair = await tx.repair.create({
                data: {
                    inquiryNumber,
                    customerId: customer.id,
                    watchId: watch.id,
                    partnerRef,
                    status: dbStatus,
                    accessories: JSON.stringify(body.request.accessories || []),
                    workSummary: body.request.diagnosis,
                    internalNotes: body.request.internalNotes,
                    customerNote: body.request.customerNote || null,
                    estimatedWorkMinutes: 0,
                    endUserName: body.customer.endUserName || null,
                }
            });

            // 5. initial Log & History logs
            const logEntries = Object.entries(body.statusLog || {});
            for (const [sId, dateStr] of logEntries) {
                await tx.repairStatusLog.create({
                    data: {
                        repairId: repair.id,
                        status: sId,
                        changedAt: new Date(dateStr as string),
                        changedBy: 1 // Admin
                    }
                });
            }

            if (logEntries.length === 0) {
                // Fallback if no log provided
                await tx.repairStatusLog.create({
                    data: {
                        repairId: repair.id,
                        status: dbStatus || "受付",
                        changedBy: 1 // Admin
                    }
                });
            }

            // 5.5 Create Photos (New)
            const photoList = body.photos || [];
            if (photoList.length > 0) {
                await Promise.all(photoList.map((p: any) =>
                    tx.repairPhoto.create({
                        data: {
                            repairId: repair.id,
                            category: p.category || 'general',
                            storageKey: p.storageKey,
                            fileName: p.fileName,
                            mimeType: p.mimeType,
                        }
                    })
                ));
            }

            // 6. Create Estimate (if items exist)
            const estimateItems = body.estimate?.items || [];
            if (estimateItems.length > 0) {
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
                                itemName: item.name,
                                type: item.type,
                                unitPrice: Math.floor(Number(item.price) || 0),
                                quantity: item.quantity || 1,
                                partsMasterId: item.partsMasterId ? Number(item.partsMasterId) : null,
                            }))
                        }
                    }
                });

                // 6.5 Master Data Sync (Batched: 2クエリで完結、N+1解消)
                const partItems = estimateItems.filter((i: any) => i.type === 'part');
                const laborItems = estimateItems.filter((i: any) => i.type === 'labor');

                if (partItems.length > 0) {
                    const partNames = partItems.map((i: any) => i.name);
                    const existingParts = await tx.partsMaster.findMany({
                        where: { nameJp: { in: partNames }, brandId: brand.id, modelId, caliberId },
                        select: { nameJp: true }
                    });
                    const existingPartNames = new Set(existingParts.map((p: any) => p.nameJp));
                    // 新規登録
                    const newParts = partItems.filter((i: any) => !existingPartNames.has(i.name));
                    if (newParts.length > 0) {
                        await tx.partsMaster.createMany({
                            data: newParts.map((item: any) => ({
                                category: 'generic',
                                brandId: brand.id, modelId, caliberId,
                                name: item.name, nameJp: item.name, nameEn: item.name,
                                retailPrice: Math.floor(Number(item.price) || 0),
                                stockQuantity: 0,
                            }))
                        });
                    }
                    // 既存エントリの上代を更新（§3：自動登録・更新）
                    for (const item of partItems) {
                        if (existingPartNames.has(item.name)) {
                            await tx.partsMaster.updateMany({
                                where: { nameJp: item.name, brandId: brand.id, modelId, caliberId },
                                data: { retailPrice: Math.floor(Number(item.price) || 0) }
                            });
                        }
                    }
                }

                if (laborItems.length > 0) {
                    const laborNames = laborItems.map((i: any) => i.name);
                    const existingRules = await tx.pricingRule.findMany({
                        where: { suggestedWorkName: { in: laborNames }, brandId: brand.id, modelId, caliberId },
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
                                brandId: brand.id, modelId, caliberId
                            }))
                        });
                    }
                    // 既存エントリの料金を更新（§3：自動登録・更新）
                    for (const item of laborItems) {
                        if (existingRuleNames.has(item.name)) {
                            await tx.pricingRule.updateMany({
                                where: { suggestedWorkName: item.name, brandId: brand.id, modelId, caliberId },
                                data: {
                                    minPrice: Math.floor(Number(item.price) || 0),
                                    maxPrice: Math.floor(Number(item.price) || 0),
                                }
                            });
                        }
                    }
                }
            }

            // 7. 在庫チェック（partsMasterId がある部品のみ）
            const stockWarnings: { partName: string; required: number; stock: number; orderRequestId: number }[] = [];
            const requiredByPart = new Map<number, number>();
            for (const item of estimateItems.filter((i: any) => i.partsMasterId)) {
                const partId = Number(item.partsMasterId);
                requiredByPart.set(partId, (requiredByPart.get(partId) ?? 0) + (item.quantity || 1));
            }
            for (const [partId, required] of Array.from(requiredByPart.entries())) {
                const master = await tx.partsMaster.findUnique({ where: { id: partId } });
                if (!master) continue;
                if (master.stockQuantity < required) {
                    const shortage = required - master.stockQuantity;
                    // 在庫不足 → OrderRequest 作成（重複防止）
                    const existing = await tx.orderRequest.findFirst({
                        where: { partsMasterId: master.id, repairId: repair.id, status: { in: ['pending', 'ordered'] } }
                    });
                    const orderRequest = existing
                        ? await tx.orderRequest.update({
                            where: { id: existing.id },
                            data: { quantity: shortage }
                        })
                        : await tx.orderRequest.create({
                        data: {
                            partsMasterId: master.id,
                            partNameJp: master.nameJp,
                            partNameEn: master.nameEn ?? null,
                            partRefs: master.partRefs ?? null,
                            cousinsNumber: master.cousinsNumber ?? null,
                            quantity: shortage,
                            supplierId: master.supplierId ?? null,
                            searchWordJp: master.nameJp,
                            searchWordEn: master.nameEn ?? null,
                            repairId: repair.id,
                            status: 'pending',
                        }
                    });
                    stockWarnings.push({
                        partName: master.nameJp,
                        required,
                        stock: master.stockQuantity,
                        orderRequestId: orderRequest.id,
                    });
                } else {
                    // 在庫あり → 引き当て（在庫数 -1）
                    await tx.partsMaster.update({
                        where: { id: master.id },
                        data: { stockQuantity: { decrement: required } }
                    });
                }
            }

            const repairOrders = await tx.orderRequest.findMany({
                where: {
                    repairId: repair.id,
                    status: { in: ['pending', 'ordered', 'received'] }
                },
                select: { status: true }
            });
            const aggregatedRepairStatus = getRepairStatusFromOrderStatuses(
                repairOrders.map(order => order.status as RepairPartsOrderStatus)
            );
            const finalRepair = aggregatedRepairStatus
                ? await tx.repair.update({
                    where: { id: repair.id },
                    data: { status: aggregatedRepairStatus }
                })
                : repair;

            // 6. Return Data
            return { repair: finalRepair, stockWarnings };
        }, {
            timeout: 5000
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
