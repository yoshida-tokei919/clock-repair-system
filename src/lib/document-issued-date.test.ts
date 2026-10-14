import assert from "node:assert/strict";
import test from "node:test";
import {
  canChangeDeliveryIssuedDate, canChangeInvoiceIssuedDate, canChangeUnrenderedIssuedDate,
  displayIssuedDate, formatIssuedDate, parseIssuedDate, todayIssuedDate,
  resolveIssuedDate,
} from "./document-issued-date";

test("JST boundary is the issue action's calendar day", () => {
  const action = new Date("2026-10-14T15:30:00Z");
  assert.equal(formatIssuedDate(action), "2026-10-15");
  assert.equal(todayIssuedDate(action).toISOString(), "2026-10-14T15:00:00.000Z");
  assert.equal(displayIssuedDate(todayIssuedDate(action)), "2026/10/15");
  assert.equal(resolveIssuedDate(undefined, action).toISOString(), "2026-10-14T15:00:00.000Z");
});

test("strict manual date parsing produces the supplied JST calendar date", () => {
  assert.equal(parseIssuedDate("2024-02-29").toISOString(), "2024-02-28T15:00:00.000Z");
  assert.equal(resolveIssuedDate("2026-10-02").toISOString(), "2026-10-01T15:00:00.000Z");
  for (const value of ["2026-2-01", "2026-02-30", "2025-02-29", "2026-13-01", "2026-00-01", "2026-10-15Z", " 2026-10-15", null, 20261015]) {
    assert.throws(() => parseIssuedDate(value));
  }
});

test("post-issue guards protect billing snapshots, PDF versions and send locks", () => {
  assert.equal(canChangeDeliveryIssuedDate(false, false), true);
  assert.equal(canChangeDeliveryIssuedDate(true, false), false);
  assert.equal(canChangeDeliveryIssuedDate(false, true), false);
  assert.equal(canChangeUnrenderedIssuedDate(false), true);
  assert.equal(canChangeUnrenderedIssuedDate(true), false);
  assert.equal(canChangeInvoiceIssuedDate("issued", false, false), true);
  assert.equal(canChangeInvoiceIssuedDate("paid", false, false), true);
  assert.equal(canChangeInvoiceIssuedDate("void", false, false), false);
  assert.equal(canChangeInvoiceIssuedDate("issued", true, false), false);
  assert.equal(canChangeInvoiceIssuedDate("issued", false, true), false);
});
