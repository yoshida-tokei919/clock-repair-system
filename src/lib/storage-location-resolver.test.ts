import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { parseStorageLocationIdentifier, resolveStorageLocation } from "./storage-location-resolver";
import { combineLocationScanResults, locationScanCandidates, scanPhase } from "./scan-session-domain";

test("location identifiers use complete NFC bytes and distinct shortCode/QR candidates", () => {
  assert.deepEqual(parseStorageLocationIdentifier({ type: "NFC_UID", value: " 04:33-3f " }),
    { type: "NFC_UID", value: "04333F" });
  for (const value of ["04:33:", "123", "04::33", "04  33", "0G"]) {
    assert.throws(() => parseStorageLocationIdentifier({ type: "NFC_UID", value }));
  }
  assert.deepEqual(locationScanCandidates(" LOC-000001 "), [{ type: "SHORT_CODE", value: "LOC-000001" }]);
  assert.deepEqual(locationScanCandidates("LOC-12345"), [{ type: "QR_TOKEN", value: "LOC-12345" }]);
  assert.deepEqual(locationScanCandidates("04:33:3f"), [
    { type: "QR_TOKEN", value: "04:33:3f" }, { type: "NFC_UID", value: "04333F" },
  ]);
  assert.deepEqual(locationScanCandidates(""), []);
});

test("resolver selects only safe fields and distinguishes missing, inactive and active", async () => {
  let result: any = null;
  const queries: any[] = [];
  const db = { storageLocation: { findUnique: async (query: any) => { queries.push(query); return result; } } } as unknown as PrismaClient;
  const identifier = { type: "NFC_UID" as const, value: "04333F" };
  assert.deepEqual(await resolveStorageLocation(db, identifier), { status: "NOT_FOUND" });
  result = { id: 7, name: "箱", locationType: "BOX", shortCode: null, isActive: false, nfcUid: "secret" };
  assert.deepEqual(await resolveStorageLocation(db, identifier),
    { status: "INACTIVE", storageLocationId: 7, name: "箱", locationType: "BOX", shortCode: null });
  result.isActive = true;
  assert.deepEqual(await resolveStorageLocation(db, identifier),
    { status: "RESOLVED", storageLocationId: 7, name: "箱", locationType: "BOX", shortCode: null });
  assert.deepEqual(queries[0], { where: { nfcUid: "04333F" },
    select: { id: true, name: true, locationType: true, shortCode: true, isActive: true } });
  await resolveStorageLocation(db, { type: "QR_TOKEN", value: "opaque" });
  await resolveStorageLocation(db, { type: "SHORT_CODE", value: "LOC-000001" });
  assert.deepEqual(queries.slice(-2).map(query => query.where), [{ qrToken: "opaque" }, { shortCode: "LOC-000001" }]);
});

test("location matches reject collisions and inactive disagreement", () => {
  const active = { status: "RESOLVED" as const, storageLocationId: 1, name: "棚", locationType: "SHELF", shortCode: null };
  assert.deepEqual(combineLocationScanResults([{ status: "NOT_FOUND" }, active]), active);
  assert.deepEqual(combineLocationScanResults([active, active]), active);
  assert.deepEqual(combineLocationScanResults([active, { ...active, storageLocationId: 2 }]), { status: "AMBIGUOUS" });
  assert.deepEqual(combineLocationScanResults([active, { ...active, status: "INACTIVE" }]), { status: "AMBIGUOUS" });
  assert.equal(scanPhase("LOCATION_MOVE", null), "LOCATION");
  assert.equal(scanPhase("LOCATION_MOVE", active), "REPAIR");
});
