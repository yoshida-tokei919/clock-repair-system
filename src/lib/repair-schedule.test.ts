import assert from "node:assert/strict";
import test from "node:test";
import { parseRepairScheduleInput } from "./repair-schedule";

const valid = {
    scheduledDate: "2028-02-29",
    estimatedWorkMinutes: 90,
    deliveryDateExpected: null,
    scheduleLocked: true,
};

test("schedule input normalizes valid dates and nullable fields", () => {
    assert.deepEqual(parseRepairScheduleInput(valid), {
        scheduledDate: new Date("2028-02-29T00:00:00.000Z"),
        estimatedWorkMinutes: 90,
        deliveryDateExpected: null,
        scheduleLocked: true,
    });
    assert.equal(parseRepairScheduleInput({ ...valid, scheduledDate: null }).scheduledDate, null);
});

test("schedule input rejects invalid dates, duration, and unrelated writes", () => {
    for (const scheduledDate of ["2027-02-29", "2026-04-31", "2026-1-01", "0000-01-01", "", 123]) {
        assert.throws(() => parseRepairScheduleInput({ ...valid, scheduledDate }));
    }
    for (const estimatedWorkMinutes of [-1, 1.5, 2147483648, "60", null]) {
        assert.throws(() => parseRepairScheduleInput({ ...valid, estimatedWorkMinutes }));
    }
    assert.throws(() => parseRepairScheduleInput({ ...valid, scheduleLocked: "true" }));
    assert.throws(() => parseRepairScheduleInput({ ...valid, priorityScore: 100 }));
    assert.throws(() => parseRepairScheduleInput({ ...valid, status: "作業待ち" }));
    assert.throws(() => parseRepairScheduleInput({ scheduledDate: null }));
});
