import { requireAdminApi } from "@/lib/admin-api-auth";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseRepairScheduleInput } from "@/lib/repair-schedule";
import { RepairScheduleNotFoundError, ScheduleSummaryConflictError, updateRepairSchedule } from "@/lib/repair-schedule-update";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;

    const repairId = Number((await params).id);
    if (!/^\d+$/.test((await params).id) || !Number.isSafeInteger(repairId) || repairId <= 0) {
        return NextResponse.json({ error: "Invalid repair ID" }, { status: 400 });
    }

    let input;
    try {
        input = parseRepairScheduleInput(await request.json());
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid schedule" }, { status: 400 });
    }

    try {
        const repair = await prisma.$transaction(tx => updateRepairSchedule(tx, repairId, input), {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        return NextResponse.json({ repair });
    } catch (error) {
        if (error instanceof RepairScheduleNotFoundError) {
            return NextResponse.json({ error: "Repair not found" }, { status: 404 });
        }
        if (error instanceof ScheduleSummaryConflictError ||
            (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
            return NextResponse.json({ error: "分割予定がある案件の代表日は直接変更できません。予定を再確認してください。" }, { status: 409 });
        }
        throw error;
    }
}
