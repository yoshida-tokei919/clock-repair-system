import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { bindPhysicalTagNfcUid, parsePhysicalTagNfcBind, physicalTagNfcBindFailure } from "./physical-tag-nfc-bind";

const input = { physicalTagId: 5, repairId: 10, nfcUid: "04333F45" };
const status = (error: unknown) => physicalTagNfcBindFailure(error).status;

function fixture(options: { missing?: boolean; status?: "ACTIVE" | "RETIRED"; nfcUid?: string | null;
  repairId?: number; race?: boolean; duplicate?: boolean } = {}) {
  const tag = options.missing ? null : { id: 5, status: options.status ?? "ACTIVE", nfcUid: options.nfcUid ?? null,
    shortCode: "PT-000005", qrToken: "original-token" };
  const assignment = { id: 7, physicalTagId: 5, repairId: options.repairId ?? 10, releasedAt: null };
  const calls: any[] = [];
  const db = { physicalTag: {
    findUnique: async (args: any) => { calls.push(["findUnique", args]); return tag; },
    updateMany: async (args: any) => {
      calls.push(["updateMany", args]);
      if (options.duplicate) throw Object.assign(new Error("duplicate"), { code: "P2002" });
      if (!tag || options.race || tag.nfcUid !== null || tag.status !== "ACTIVE" ||
          assignment.repairId !== args.where.assignments.some.repairId) return { count: 0 };
      tag.nfcUid = args.data.nfcUid;
      return { count: 1 };
    },
  } } as unknown as PrismaClient;
  return { db, tag, assignment, calls };
}

test("strict input uses shared byte-preserving NFC normalization", () => {
  assert.deepEqual(parsePhysicalTagNfcBind({ physicalTagId: 5, repairId: 10, nfcUid: " 04:33-3f 45 " }), input);
  for (const body of [null, [], {}, { ...input, physicalTagId: 0 }, { ...input, repairId: 2147483648 },
    { ...input, repairId: "10" }, { ...input, nfcUid: "04::33" }, { ...input, nfcUid: "0:4" },
    { ...input, nfcUid: "" }, { ...input, extra: 1 }])
    assert.throws(() => parsePhysicalTagNfcBind(body), error => status(error) === 400);
});

test("bind changes only nfcUid under active/current-assignment/null conditions", async () => {
  const f = fixture();
  const beforeTag = { ...f.tag };
  const beforeAssignment = { ...f.assignment };
  assert.deepEqual(await bindPhysicalTagNfcUid(f.db, input), input);
  assert.deepEqual(f.tag, { ...beforeTag, nfcUid: input.nfcUid });
  assert.deepEqual(f.assignment, beforeAssignment);
  assert.deepEqual(f.calls[1], ["updateMany", { where: { id: 5, status: "ACTIVE", nfcUid: null,
    assignments: { some: { repairId: 10, releasedAt: null } } }, data: { nfcUid: input.nfcUid } }]);
  assert.equal(f.calls.length, 2);
});

test("missing, retired, already bound, assignment mismatch, and same-tag race are refused", async () => {
  for (const [options, expected] of [
    [{ missing: true }, 404], [{ status: "RETIRED" }, 409], [{ nfcUid: "AA11" }, 409],
    [{ repairId: 11 }, 409], [{ race: true }, 409],
  ] as const) {
    const f = fixture(options);
    await assert.rejects(() => bindPhysicalTagNfcUid(f.db, input), error => status(error) === expected);
    assert.notEqual(f.tag?.nfcUid, input.nfcUid);
  }
});

test("database duplicate and serialization conflicts map to 409; unexpected is generic 500", async () => {
  const f = fixture({ duplicate: true });
  await assert.rejects(() => bindPhysicalTagNfcUid(f.db, input), error => status(error) === 409);
  assert.equal(status({ code: "P2034" }), 409);
  assert.deepEqual(physicalTagNfcBindFailure(new Error("secret UID")),
    { status: 500, message: "NFC UIDを登録できませんでした。" });
});
