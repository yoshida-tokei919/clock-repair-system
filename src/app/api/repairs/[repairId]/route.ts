
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PATCH(req: Request, { params }: { params: { repairId: string } }) {
    try {
        const id = parseInt(params.repairId);
        const body = await req.json();
        console.log("Updating Repair:", id, body);

        const result = await prisma.$transaction(async (tx) => {
            // 1. Update Watch Details
            if (body.watch) {
                const brand = await tx.brand.findUnique({ where: { name: body.watch.brand } });
                if (!brand) throw new Error("Brand not found");

                await tx.watch.update({
                    where: { id: (await tx.repair.findUnique({ where: { id } }))?.watchId },
                    data: {
                        brandId: brand.id,
                        serialNumber: body.watch.serial,
                        // Could update more if needed
                    }
                });
            }

            // 2. Update Repair Fields
            const statusMapping: Record<string, string> = {
                "estimate": "reception",
                "parts_wait": "parts_wait",
                "working": "in_progress",
                "completed": "completed",
                "delivered": "delivered"
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
                // Delete existing and recreate? Or granular update. 
                // For a "Full Edit" from this form, Recreating is simpler to keep in sync.
                await tx.estimateItem.deleteMany({
                    where: { estimate: { repairId: id } }
                });

                const total = body.estimate.items.reduce((sum: number, item: any) => sum + item.price, 0);

                await tx.estimate.updateMany({
                    where: { repairId: id },
                    data: {
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
            }

            return repair;
        });

        return NextResponse.json({ success: true, repair: result });
    } catch (error: any) {
        console.error("Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
