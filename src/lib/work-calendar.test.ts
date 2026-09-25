import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WORK_MINUTES,
  availableMinutesForDate,
  isDefaultWorkDay,
  parseWorkCalendarInput,
  parseWorkDate,
  parseWorkMonth,
  serializeWorkDate,
} from "./work-calendar";

test("valid calendar dates and months use UTC midnight", () => {
  assert.equal(parseWorkDate("2028-02-29").toISOString(), "2028-02-29T00:00:00.000Z");
  assert.equal(serializeWorkDate(parseWorkDate("2028-02-29")), "2028-02-29");
  assert.deepEqual(parseWorkMonth("2028-02"), {
    month: "2028-02",
    start: new Date("2028-02-01T00:00:00.000Z"),
    end: new Date("2028-03-01T00:00:00.000Z"),
  });
  assert.equal(parseWorkMonth("0001-01").end.toISOString(), "0001-02-01T00:00:00.000Z");
  assert.equal(parseWorkMonth("0001-01").end.toISOString(), "0001-02-01T00:00:00.000Z");
  assert.equal(serializeWorkDate(new Date("2028-02-29T00:00:00.000Z")), "2028-02-29");
  assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", day: "numeric" }).format(parseWorkDate("2028-02-29")), "28");
  assert.equal(serializeWorkDate(parseWorkDate("2028-02-29")), "2028-02-29");
});

test("invalid dates and months are rejected", () => {
  for (const value of ["2027-02-29", "2026-04-31", "2026-1-01", "0000-01-01", "2026-13-01", "", null]) {
    assert.throws(() => parseWorkDate(value));
  }
  for (const value of ["2026-00", "2026-13", "2026-1", "0000-01", "2026-02-01", null]) {
    assert.throws(() => parseWorkMonth(value));
  }
  assert.throws(() => serializeWorkDate(new Date(Number.NaN)));
});

test("input accepts the full minute range and normalizes notes", () => {
  for (const availableMinutes of [0, 240, 480, 1440]) {
    const input = parseWorkCalendarInput({ date: "2028-02-29", availableMinutes, note: "  私用  " });
    assert.equal(input.availableMinutes, availableMinutes);
    assert.equal(input.note, "私用");
    assert.equal(input.workDate.toISOString(), "2028-02-29T00:00:00.000Z");
  }
  assert.equal(parseWorkCalendarInput({ date: "2028-02-29", availableMinutes: 480, note: "  " }).note, null);
  assert.equal(isDefaultWorkDay(parseWorkCalendarInput({ date: "2028-02-29", availableMinutes: 480, note: "  " })), true);
});

test("input rejects invalid minutes, notes and unrelated fields", () => {
  const valid = { date: "2028-02-29", availableMinutes: 480, note: null };
  for (const availableMinutes of [-1, 1441, 7.5, "240", null]) {
    assert.throws(() => parseWorkCalendarInput({ ...valid, availableMinutes }));
  }
  assert.throws(() => parseWorkCalendarInput({ ...valid, note: "x".repeat(201) }));
  assert.throws(() => parseWorkCalendarInput({ ...valid, note: 1 }));
  assert.throws(() => parseWorkCalendarInput({ ...valid, status: "pending" }));
});

test("480 minutes with no note resets to the default day", () => {
  assert.equal(DEFAULT_WORK_MINUTES, 480);
  assert.equal(isDefaultWorkDay({ availableMinutes: 480, note: null }), true);
  assert.equal(isDefaultWorkDay({ availableMinutes: 480, note: "私用" }), false);
  assert.equal(isDefaultWorkDay({ availableMinutes: 240, note: null }), false);
  const exceptions = [{ workDate: parseWorkDate("2028-02-29"), availableMinutes: 240, note: null }];
  assert.equal(availableMinutesForDate("2028-02-28", exceptions), 480);
  assert.equal(availableMinutesForDate("2028-02-29", exceptions), 240);
});
