import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { parseProcurementId, parseShippingMethodInput, parseSupplierLeadTimeInput } from "./procurement-settings-domain";
import { getProcurementSettings, procurementSettingsResponseError, saveSupplierLeadTime } from "./procurement-settings";

const shipping = { name: "  DHL  ", carrierName: "  carrier  ", manualTransitLeadDays: null,
  isActive: true, notes: "  note  " };

test("supplier days preserve null, zero, and positive integers", () => {
  for (const value of [null, 0, 5])
    assert.deepEqual(parseSupplierLeadTimeInput({ manualProcessingLeadDays: value }), { manualProcessingLeadDays: value });
  for (const value of [-1, 1.5, "0", undefined])
    assert.throws(() => parseSupplierLeadTimeInput({ manualProcessingLeadDays: value }));
  assert.throws(() => parseSupplierLeadTimeInput({ manualProcessingLeadDays: 0, extra: true }));
  assert.throws(() => parseSupplierLeadTimeInput({}));
});

test("shipping fields trim and validate exact input", () => {
  assert.deepEqual(parseShippingMethodInput(shipping), { name: "DHL", carrierName: "carrier",
    manualTransitLeadDays: null, isActive: true, notes: "note" });
  assert.deepEqual(parseShippingMethodInput({ ...shipping, carrierName: "  ", notes: " ", manualTransitLeadDays: 0 }),
    { name: "DHL", carrierName: null, manualTransitLeadDays: 0, isActive: true, notes: null });
  assert.equal(parseShippingMethodInput({ ...shipping, manualTransitLeadDays: 7 }).manualTransitLeadDays, 7);
  for (const value of [-1, 0.2, "0"])
    assert.throws(() => parseShippingMethodInput({ ...shipping, manualTransitLeadDays: value }));
  assert.throws(() => parseShippingMethodInput({ ...shipping, name: " " }));
  assert.throws(() => parseShippingMethodInput({ ...shipping, isActive: "true" }));
  assert.throws(() => parseShippingMethodInput({ ...shipping, extra: true }));
  assert.throws(() => parseShippingMethodInput({ ...shipping, carrierName: undefined }));
});

test("ids reject malformed and out-of-range values", () => {
  assert.equal(parseProcurementId("1", "ID"), 1);
  for (const value of ["0", "-1", "1.5", "abc", "01", "2147483648"])
    assert.throws(() => parseProcurementId(value, "ID"));
});

test("settings list includes suppliers without settings and inactive methods", async () => {
  const db = {
    supplier: { findMany: async () => [
      { id: 1, name: "A", leadTimeSetting: null },
      { id: 2, name: "B", leadTimeSetting: { manualProcessingLeadDays: 0 } },
    ] },
    procurementShippingMethod: { findMany: async () => [
      { id: 2, name: "Active", isActive: true }, { id: 1, name: "Inactive", isActive: false },
    ] },
  } as unknown as PrismaClient;
  const result = await getProcurementSettings(db);
  assert.deepEqual(result.suppliers, [
    { id: 1, name: "A", manualProcessingLeadDays: null },
    { id: 2, name: "B", manualProcessingLeadDays: 0 },
  ]);
  assert.deepEqual(result.shippingMethods.map(row => row.isActive), [true, false]);
});

test("supplier save checks existence before upsert", async () => {
  let upserts = 0;
  const db = {
    supplier: { findUnique: async ({ where }: { where: { id: number } }) =>
      where.id === 1 ? { id: 1, name: "A" } : null },
    supplierLeadTimeSetting: { upsert: async ({ create }: { create: { manualProcessingLeadDays: number | null } }) => {
      upserts++; return { manualProcessingLeadDays: create.manualProcessingLeadDays };
    } },
  } as unknown as PrismaClient;
  assert.deepEqual(await saveSupplierLeadTime(db, 1, 0), { id: 1, name: "A", manualProcessingLeadDays: 0 });
  await assert.rejects(() => saveSupplierLeadTime(db, 2, null), /仕入先/);
  assert.equal(upserts, 1);
});

test("database conflicts and missing rows have explicit statuses", () => {
  assert.equal(procurementSettingsResponseError({ code: "P2002" }).status, 409);
  assert.equal(procurementSettingsResponseError({ code: "P2025" }).status, 404);
  assert.equal(procurementSettingsResponseError({ code: "P2003" }).status, 404);
  assert.equal(procurementSettingsResponseError(new SyntaxError()).status, 400);
});
