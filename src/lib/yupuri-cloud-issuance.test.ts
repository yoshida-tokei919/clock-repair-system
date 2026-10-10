import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient, Shipment } from "@prisma/client";
import { completeCloudIssue, nextCloudIssue, parseIssueComplete, parseIssueRequest, requestCloudIssue } from "./yupuri-cloud-issuance";

const now = new Date("2030-01-01T00:00:00.000Z");
function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return { id: 42, customerId: 1, direction: "OUTBOUND", status: "DRAFT", carrierCode: null, serviceCode: null,
    handoffMethod: null, plannedShipDate: new Date("2030-01-02T00:00:00.000Z"), labelIssuedAt: null,
    handoffRequestedAt: null, actualShippedAt: null, deliveredAt: null, trackingNumber: null,
    destinationRecipientName: "テスト太郎", destinationPostalCode: "1040045", destinationPrefecture: "東京都",
    destinationCity: "中央区", destinationStreet: "築地5-5-5", destinationBuilding: null,
    destinationPhone: "03-8888-8888", requestedDeliveryDate: null, requestedDeliveryTimeSlot: null,
    createdAt: now, updatedAt: now, ...overrides };
}

function fake(initial: Shipment) {
  let row = initial;
  let updates = 0;
  let duplicate = false;
  const shipmentApi = {
    findUnique: async () => row,
    findMany: async () => [row],
    findFirst: async () => duplicate ? { id: 99 } : null,
    updateMany: async ({ where, data }: { where: { status: string }; data: Partial<Shipment> }) => {
      if (row.status !== where.status) return { count: 0 };
      row = { ...row, ...data }; updates++;
      return { count: 1 };
    },
  };
  const db = { shipment: shipmentApi, $transaction: async (fn: (tx: { shipment: typeof shipmentApi }) => Promise<unknown>) => fn({ shipment: shipmentApi }) } as unknown as PrismaClient;
  return { db, get row() { return row; }, get updates() { return updates; }, setDuplicate(value: boolean) { duplicate = value; } };
}

test("issue request validates confirmation, Cloud CSV, canonical codes and repeats safely", async () => {
  assert.throws(() => parseIssueRequest({ confirmed: false }));
  assert.throws(() => parseIssueRequest({ confirmed: true, extra: 1 }));
  const state = fake(shipment());
  assert.deepEqual(await requestCloudIssue(state.db, 42, { confirmed: true }, now), {
    shipmentId: 42, status: "READY", alreadyIssued: false, trackingNumber: null,
  });
  assert.equal(state.row.carrierCode, "JAPAN_POST");
  assert.equal(state.row.serviceCode, "YU_PACK");
  assert.equal(state.updates, 1);
  await requestCloudIssue(state.db, 42, { confirmed: true }, now);
  assert.equal(state.updates, 1);
  const job = await nextCloudIssue(state.db, now);
  assert.equal(job?.managementNumber, "SHP-42");
  assert.equal(Buffer.from(job!.csvBase64, "base64").subarray(0, 3).toString("hex"), "efbbbf");
});

test("invalid CSV and conflicting carrier or issued fields do not transition", async () => {
  for (const overrides of [
    { plannedShipDate: null }, { carrierCode: "YAMATO" }, { serviceCode: "OTHER" },
    { trackingNumber: "398007150100" }, { actualShippedAt: now }, { direction: "INBOUND" as const },
  ]) {
    const state = fake(shipment(overrides));
    await assert.rejects(requestCloudIssue(state.db, 42, { confirmed: true }, now));
    assert.equal(state.updates, 0);
  }
});

test("completion validates exact management, 12 digits, duplicate tracking and idempotency", async () => {
  assert.throws(() => parseIssueComplete({ shipmentId: 42, managementNumber: "SHP-41", trackingNumber: "398007150100" }));
  assert.throws(() => parseIssueComplete({ shipmentId: 42, managementNumber: "SHP-42", trackingNumber: "123" }));
  const input = parseIssueComplete({ shipmentId: 42, managementNumber: "SHP-42", trackingNumber: "398007150100" });
  const state = fake(shipment({ status: "READY", carrierCode: "JAPAN_POST", serviceCode: "YU_PACK" }));
  state.setDuplicate(true);
  await assert.rejects(completeCloudIssue(state.db, input, now));
  assert.equal(state.updates, 0);
  state.setDuplicate(false);
  assert.deepEqual(await completeCloudIssue(state.db, input, now), { shipmentId: 42, status: "LABEL_ISSUED", alreadyIssued: false });
  assert.equal(state.row.trackingNumber, "398007150100");
  assert.equal(state.row.labelIssuedAt?.toISOString(), now.toISOString());
  assert.equal(state.row.actualShippedAt, null);
  assert.deepEqual(await completeCloudIssue(state.db, input, now), { shipmentId: 42, status: "LABEL_ISSUED", alreadyIssued: true });
  assert.equal(state.updates, 1);
  await assert.rejects(completeCloudIssue(state.db, { ...input, trackingNumber: "398007150101" }, now));
});
