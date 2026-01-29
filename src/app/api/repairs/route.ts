
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
                // Try fuzzy match or English/Japanese match
                brand = await tx.brand.findFirst({
                    where: {
                        OR: [
                            { nameEn: brandNameInput },
                            { nameJp: brandNameInput },
                            // Handle "ROLEX ロレックス" composite case if common?
                            // Or just lenient check
                        ]
                    }
                });
            }

            // Extreme fallback: Create Brand if missing? (Maybe too dangerous for master data)
            // For now just error if truly invalid.
            if (!brand) {
                // Try one last check: Split by space? "ROLEX ロレックス" -> "ROLEX"
                const parts = brandNameInput.split(" ");
                if (parts.length > 1) {
                    brand = await tx.brand.findUnique({ where: { name: parts[0] } });
                }
            }

            if (!brand) throw new Error(`Invalid Brand Name: ${brandNameInput}`);

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
                where: { brandId: brand.id, name: modelNameInput }
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
                    where: { name: caliberInput }
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
                // Update watch if caliber or reference was missing
                const updateData: any = {};
                if (!watch.caliberId && caliberId) updateData.caliberId = caliberId;
                if (!watch.referenceId && referenceId) updateData.referenceId = referenceId;

                if (Object.keys(updateData).length > 0) {
                    watch = await tx.watch.update({
                        where: { id: watch.id },
                        data: updateData
                    });
                }
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
            const dbStatus = statusMapping[body.status] || body.status || "reception";

            const repair = await tx.repair.create({
                data: {
                    inquiryNumber,
                    customerId: customer.id,
                    watchId: watch.id,
                    partnerRef,
                    status: dbStatus,
                    accessories: JSON.stringify(body.request.accessories || []),
                    workSummary: body.request.diagnosis, // Using diagnosis field as summary request
                    internalNotes: body.request.internalNotes,
                    estimatedWorkMinutes: 0,
                    endUserName: body.customer.endUserName || null,
                }
            });

            // 5. initial Log & History logs
            const statusLabels: Record<string, string> = {
                "reception": "受付",
                "diagnosing": "見積中",
                "parts_wait": "部品待 (未注文)",
                "parts_wait_ordered": "部品待 (注文済)",
                "in_progress": "作業中",
                "completed": "完了",
                "delivered": "納品済",
                "canceled": "キャンセル"
            };

            const logEntries = Object.entries(body.statusLog || {});
            for (const [sId, dateStr] of logEntries) {
                await tx.repairStatusLog.create({
                    data: {
                        repairId: repair.id,
                        status: statusLabels[sId] || sId,
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
                        status: statusLabels[dbStatus] || "受付",
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
                const total = estimateItems.reduce((sum: number, item: any) => sum + item.price, 0);
                const techFee = estimateItems.filter((i: any) => i.type === 'labor').reduce((sum: number, i: any) => sum + i.price, 0);
                const partsFee = estimateItems.filter((i: any) => i.type === 'part').reduce((sum: number, i: any) => sum + i.price, 0);

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
                                unitPrice: item.price,
                                quantity: 1
                            }))
                        }
                    }
                });

                // 6.5 Master Data Sync (New)
                // Automatically register items to PartsMaster/PricingRule if they don't exist
                for (const item of estimateItems) {
                    if (item.type === 'part') {
                        const existingPart = await tx.partsMaster.findFirst({
                            where: {
                                nameJp: item.name,
                                brandId: brand.id,
                                modelId: modelId,
                                caliberId: caliberId
                            }
                        });
                        if (!existingPart) {
                            await tx.partsMaster.create({
                                data: {
                                    category: 'generic', // Default from repair entry
                                    brandId: brand.id,
                                    modelId: modelId,
                                    caliberId: caliberId,
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
                                brandId: brand.id,
                                modelId: modelId,
                                caliberId: caliberId
                            }
                        });
                        if (!existingRule) {
                            await tx.pricingRule.create({
                                data: {
                                    suggestedWorkName: item.name,
                                    minPrice: item.price,
                                    maxPrice: item.price,
                                    brandId: brand.id,
                                    modelId: modelId,
                                    caliberId: caliberId
                                }
                            });
                        }
                    }
                }
            }

            // 6. Return Data
            return repair;
        });

        return NextResponse.json({ success: true, repair: result });
    } catch (error: any) {
        console.error("Transaction Error:", error);
        // Write error to file for debugging
        const fs = require('fs');
        fs.writeFileSync('server_error.txt', `${new Date().toISOString()} - ${error.message}\n${JSON.stringify(error, null, 2)}\n`);

        return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
    }
}
