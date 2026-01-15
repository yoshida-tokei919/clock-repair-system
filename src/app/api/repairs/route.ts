import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculatePriorityScore, estimateWorkMinutes } from "@/lib/scheduling";

// POST /api/repairs
// Create a new repair ticket with auto-scheduling
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Destructure input
        const {
            customerId,
            watchData, // { brandId, modelId, caliberId, serial, ... }
            requestDetails,
            deadline // Optional expected delivery date
        } = body;

        // 1. Fetch related master data for logic
        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

        // Handle Watch (Find or Create)
        // Simplified for MVP: Create new watch if serial+brand collision doesn't exist
        // In real app, we handle the collision check strictly.
        let watch = await prisma.watch.findFirst({
            where: {
                brandId: Number(watchData.brandId),
                serialNumber: watchData.serialNumber
            }
        });

        if (!watch) {
            // Create new watch
            watch = await prisma.watch.create({
                data: {
                    brandId: Number(watchData.brandId),
                    modelId: Number(watchData.modelId),
                    caliberId: watchData.caliberId ? Number(watchData.caliberId) : null,
                    serialNumber: watchData.serialNumber,
                    customerId: customer.id
                }
            });
        }

        // 2. Logic: Time Estimation
        let workMinutes = 60; // default
        if (watch.caliberId) {
            const caliber = await prisma.caliber.findUnique({ where: { id: watch.caliberId } });
            if (caliber) {
                workMinutes = estimateWorkMinutes(caliber.name, caliber.movementType, caliber.standardWorkMinutes);
            }
        }

        // 3. Logic: Priority Score
        const targetDate = deadline ? new Date(deadline) : null;
        const priority = calculatePriorityScore(targetDate, customer.rank || 1, workMinutes);

        // 4. Create Repair Record
        // Generate simple Inquiry Number (T-00X)
        const count = await prisma.repair.count();
        const inquiryNum = `T-${String(count + 1).padStart(3, '0')}`;

        const repair = await prisma.repair.create({
            data: {
                inquiryNumber: inquiryNum,
                customerId: customer.id,
                watchId: watch.id,
                status: "reception",
                workSummary: requestDetails,

                // Auto-calculated fields
                estimatedWorkMinutes: workMinutes,
                priorityScore: priority,
                deliveryDateExpected: targetDate, // Null if not specified

                // For now, schedule date = today + simple logic? 
                // Real implementation would find first available slot.
                // Let's just leave scheduledDate null for the separate scheduler process to fill,
                // OR set a default.
                scheduledDate: null
            }
        });

        return NextResponse.json({
            success: true,
            data: repair,
            logic_debug: {
                calculated_priority: priority,
                estimated_minutes: workMinutes
            }
        });

    } catch (error) {
        console.error("Repair Create Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
