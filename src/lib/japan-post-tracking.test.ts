import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import * as iconv from "iconv-lite";
import { JAPAN_POST_POLL_STATUSES, previewJapanPostTrackingCsv } from "./japan-post-tracking";
import { YUPURI_HISTORY_HEADER } from "./yupuri-history";

const header = YUPURI_HISTORY_HEADER.map(value => `"${value}"`).join(",");
const row = (id: number, tracking = "193715301010", aggregate = "11", detail = "01",
  acceptance = "20261013090000", delivered = "") => [
  `SHP-${id}`, tracking, acceptance, delivered, aggregate, detail,
].map(value => `"${value}"`).join(",");
const csv = (...rows: string[]) => iconv.encode(`${header}\r\n${rows.join("\r\n")}\r\n`, "cp932");

function db(rows: Array<{
  id: number;
  direction?: "INBOUND" | "OUTBOUND";
  status?: string;
  carrierCode?: string | null;
  trackingNumber?: string | null;
  actualShippedAt?: Date | null;
  deliveredAt?: Date | null;
}>) {
  let query: unknown;
  const shipment = new Proxy({
    findMany: async (value: unknown) => {
      query = value;
      return rows.map(item => ({
        direction: "OUTBOUND" as const,
        status: "LABEL_ISSUED",
        carrierCode: "JAPAN_POST",
        trackingNumber: "193715301010",
        actualShippedAt: null,
        deliveredAt: null,
        ...item,
      }));
    },
  }, {
    get(target, key) {
      if (key === "findMany") return target.findMany;
      throw new Error(`Unexpected DB operation: ${String(key)}`);
    },
  });
  return { client: { shipment } as unknown as Pick<PrismaClient, "shipment">, getQuery: () => query };
}

test("Cloud CSV uses the existing official status table without DOM parsing", async () => {
  const fixture = db([
    { id: 42 },
    { id: 43, status: "IN_TRANSIT", trackingNumber: "193715301011" },
    { id: 44, status: "OUT_FOR_DELIVERY", trackingNumber: "193715301012" },
  ]);
  const result = await previewJapanPostTrackingCsv(fixture.client, csv(
    row(42, "193715301010", "11", "01"),
    row(43, "193715301011", "50", "01"),
    row(44, "193715301012", "52", "01", "20261013090000", "20261014123000"),
  ));
  assert.deepEqual(result.map(item => [item.shipmentId, item.description, item.state, item.candidate]), [
    [42, "引受", "SHIPPED", true],
    [43, "持出中", "OUT_FOR_DELIVERY", true],
    [44, "配達完了", "DELIVERED", true],
  ]);
  assert.deepEqual(fixture.getQuery(), {
    where: { id: { in: [42, 43, 44] } },
    select: {
      id: true, direction: true, status: true, carrierCode: true, trackingNumber: true,
      actualShippedAt: true, deliveredAt: true,
    },
  });
});

test("preview is read-only and fails closed for carrier/tracking/inactive/unknown conditions", async () => {
  const fixture = db([
    { id: 41, carrierCode: "YAMATO", trackingNumber: "193715301009" },
    { id: 42, trackingNumber: "999999999999" },
    { id: 43, status: "DELIVERED", trackingNumber: "193715301011" },
    { id: 44, trackingNumber: "193715301012" },
  ]);
  const result = await previewJapanPostTrackingCsv(fixture.client, csv(
    row(41, "193715301009"), row(42),
    row(43, "193715301011", "52", "01", "20261013090000", "20261014123000"),
    row(44, "193715301012", "ZZ", "ZZ"),
  ));
  assert.equal(result[0].candidate, false);
  assert.ok(result[0].errors.includes("Shipment carrier is not Japan Post"));
  assert.equal(result[1].candidate, false);
  assert.ok(result[1].errors.includes("Existing Shipment tracking number conflicts with candidate"));
  assert.ok(result[1].errors.includes("Shipment tracking number does not exactly match the Cloud CSV"));
  assert.equal(result[2].candidate, false);
  assert.ok(result[2].errors.includes("Shipment is not an active Japan Post tracking candidate"));
  assert.equal(result[3].candidate, false);
  assert.equal(result[3].state, null);
  assert.ok(result[3].warnings.includes("Unverified delivery status codes"));
});

test("missing Shipment, duplicate SHP row and malformed/non-CP932 CSV fail closed", async () => {
  const missing = await previewJapanPostTrackingCsv(db([]).client, csv(row(99)));
  assert.equal(missing[0].candidate, false);
  assert.ok(missing[0].errors.includes("Shipment not found"));
  const duplicate = await previewJapanPostTrackingCsv(db([{ id: 42 }]).client, csv(row(42), row(42)));
  assert.equal(duplicate.length, 2);
  assert.ok(duplicate.every(item => item.errors.includes("Duplicate management number") && !item.candidate));
  await assert.rejects(previewJapanPostTrackingCsv(db([]).client, Buffer.from("not csv", "utf8")));
});

test("candidate status boundary excludes delivered/cancelled and pre-label states", () => {
  assert.deepEqual(JAPAN_POST_POLL_STATUSES, [
    "LABEL_ISSUED", "AWAITING_ACCEPTANCE", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "EXCEPTION",
  ]);
});
