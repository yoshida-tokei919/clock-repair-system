import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  parsePhysicalTagIdentifier,
  PhysicalTagIdentifierError,
  resolvePhysicalTag,
} from "./physical-tag-resolver";

test("NFC UID normalization preserves byte order and strips only common separators", () => {
  assert.deepEqual(
    parsePhysicalTagIdentifier({ type: "NFC_UID", value: " 04:33:3f:45:3b:02:89 " }),
    { type: "NFC_UID", value: "04333F453B0289" },
  );
  assert.deepEqual(
    parsePhysicalTagIdentifier({ type: "NFC_UID", value: "04-33 3f-45 3b-02 89" }),
    { type: "NFC_UID", value: "04333F453B0289" },
  );
});

test("QR token and short code are trimmed without case folding", () => {
  assert.deepEqual(parsePhysicalTagIdentifier({ type: "QR_TOKEN", value: " AbC-xyz " }),
    { type: "QR_TOKEN", value: "AbC-xyz" });
  assert.deepEqual(parsePhysicalTagIdentifier({ type: "SHORT_CODE", value: " Pt-0042 " }),
    { type: "SHORT_CODE", value: "Pt-0042" });
});

test("malformed or ambiguous NFC UID input is rejected instead of guessed", () => {
  for (const value of ["", "04:33:GG:45", "12\t34", "04333F453B028", "0:4", "04:", "04::33"]) {
    assert.throws(
      () => parsePhysicalTagIdentifier({ type: "NFC_UID", value }),
      PhysicalTagIdentifierError,
    );
  }
});

function mockDb(tag: unknown, calls: unknown[]) {
  return {
    physicalTag: {
      findUnique: async (args: unknown) => {
        calls.push(args);
        return tag;
      },
    },
  } as unknown as PrismaClient;
}

test("resolver uses the matching unique identifier and returns NOT_FOUND", async () => {
  const calls: unknown[] = [];
  const result = await resolvePhysicalTag(mockDb(null, calls), {
    type: "QR_TOKEN",
    value: "CaseSensitiveToken",
  });
  assert.deepEqual(result, { status: "NOT_FOUND" });
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as { where: unknown }).where, {
    qrToken: "CaseSensitiveToken",
  });
});

test("resolver distinguishes RETIRED and UNASSIGNED", async () => {
  const retired = await resolvePhysicalTag(mockDb({
    id: 7,
    shortCode: "PT-0007",
    status: "RETIRED",
    assignments: [],
  }, []), { type: "SHORT_CODE", value: "PT-0007" });
  assert.deepEqual(retired, {
    status: "RETIRED",
    physicalTagId: 7,
    shortCode: "PT-0007",
  });

  const unassigned = await resolvePhysicalTag(mockDb({
    id: 8,
    shortCode: "PT-0008",
    status: "ACTIVE",
    assignments: [],
  }, []), { type: "NFC_UID", value: "04333F453B0289" });
  assert.deepEqual(unassigned, {
    status: "UNASSIGNED",
    physicalTagId: 8,
    shortCode: "PT-0008",
  });
});

test("resolver returns only the minimal active assignment and Repair data", async () => {
  const calls: unknown[] = [];
  const assignedAt = new Date("2026-10-01T00:00:00.000Z");
  const result = await resolvePhysicalTag(mockDb({
    id: 9,
    shortCode: "PT-0009",
    status: "ACTIVE",
    assignments: [{
      id: 91,
      assignedAt,
      repair: {
        id: 123,
        inquiryNumber: "T-00123",
        customerId: 45,
        status: "作業待ち",
      },
    }],
  }, calls), { type: "NFC_UID", value: "04333F453B0289" });

  assert.deepEqual(result, {
    status: "RESOLVED",
    physicalTagId: 9,
    shortCode: "PT-0009",
    assignmentId: 91,
    assignedAt,
    repairId: 123,
    inquiryNumber: "T-00123",
    customerId: 45,
    repairStatus: "作業待ち",
  });

  const query = calls[0] as { where: unknown; select: unknown };
  assert.deepEqual(query.where, { nfcUid: "04333F453B0289" });
  assert.deepEqual(query.select, {
    id: true,
    shortCode: true,
    status: true,
    assignments: {
      where: { releasedAt: null },
      take: 1,
      select: {
        id: true,
        assignedAt: true,
        repair: {
          select: { id: true, inquiryNumber: true, customerId: true, status: true },
        },
      },
    },
  });
});
