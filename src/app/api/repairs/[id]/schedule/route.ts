import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRepairScheduleInput } from "@/lib/repair-schedule";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repairId = Number(params.id);
    if (!/^\d+$/.test(params.id) || !Number.isSafeInteger(repairId) || repairId <= 0) {
        return NextResponse.json({ error: "Invalid repair ID" }, { status: 400 });
    }

    let input;
    try {
        input = parseRepairScheduleInput(await request.json());
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid schedule" }, { status: 400 });
    }

    const updated = await prisma.repair.updateMany({ where: { id: repairId }, data: input });
    if (updated.count === 0) {
        return NextResponse.json({ error: "Repair not found" }, { status: 404 });
    }

    const repair = await prisma.repair.findUniqueOrThrow({
        where: { id: repairId },
        select: {
            scheduledDate: true,
            estimatedWorkMinutes: true,
            deliveryDateExpected: true,
            scheduleLocked: true,
            priorityScore: true,
        },
    });
    return NextResponse.json({ repair });
}
