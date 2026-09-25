export type RepairScheduleInput = {
    scheduledDate: Date | null;
    estimatedWorkMinutes: number;
    deliveryDateExpected: Date | null;
    scheduleLocked: boolean;
};

const allowedKeys = [
    "scheduledDate",
    "estimatedWorkMinutes",
    "deliveryDateExpected",
    "scheduleLocked",
] as const;

function parseCalendarDate(value: unknown, field: string): Date | null {
    if (value === null) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${field} must be null or YYYY-MM-DD.`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (value.slice(0, 4) === "0000" || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new Error(`${field} must be a valid calendar date.`);
    }
    return date;
}

export function parseRepairScheduleInput(value: unknown): RepairScheduleInput {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Schedule body must be an object.");
    }
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length !== allowedKeys.length ||
        Object.keys(body).some((key) => !allowedKeys.includes(key as typeof allowedKeys[number]))) {
        throw new Error("Schedule body must contain only the four schedule fields.");
    }
    if (!Number.isInteger(body.estimatedWorkMinutes) ||
        (body.estimatedWorkMinutes as number) < 0 || (body.estimatedWorkMinutes as number) > 2147483647) {
        throw new Error("estimatedWorkMinutes must be an integer from 0 to 2147483647.");
    }
    if (typeof body.scheduleLocked !== "boolean") {
        throw new Error("scheduleLocked must be boolean.");
    }
    return {
        scheduledDate: parseCalendarDate(body.scheduledDate, "scheduledDate"),
        estimatedWorkMinutes: body.estimatedWorkMinutes as number,
        deliveryDateExpected: parseCalendarDate(body.deliveryDateExpected, "deliveryDateExpected"),
        scheduleLocked: body.scheduleLocked,
    };
}
