import assert from "node:assert/strict";
import test from "node:test";
import * as iconv from "iconv-lite";
import type { PrismaClient } from "@prisma/client";
import {
  canApplyJapanPostState,
  parseYuPriOperationTimestamp,
  syncJapanPostTrackingCsv,
} from "./japan-post-tracking-sync";
import { YUPURI_HISTORY_HEADER } from "./yupuri-history";

const header = YUPURI_HISTORY_HEADER.map(value => `"${value}"`).join(",");
const tracking = "193715301010";
const line = (aggregate: string, detail: string, acceptance = "20261013090000", delivery = "") =>
  ["SHP-42", tracking, acceptance, delivery, aggregate, detail].map(value => `"${value}"`).join(",");
const csv = (row: string) => iconv.encode(`${header}\r\n${row}\r\n`, "cp932");

type Row = {
  id: number; direction: "OUTBOUND" | "INBOUND"; carrierCode: string | null; status: string;
  trackingNumber: string | null; actualShippedAt: Date | null; deliveredAt: Date | null;
};
function fixture(overrides: Partial<Row> = {}) {
  const row: Row = { id: 42, direction: "OUTBOUND", carrierCode: "JAPAN_POST", status: "LABEL_ISSUED",
    trackingNumber: tracking, actualShippedAt: null, deliveredAt: null, ...overrides };
  let updates = 0;
  const shipment = {
    findMany: async ({ where }: any) => where.id.in.includes(row.id) ? [{ ...row }] : [],
    findUnique: async ({ where }: any) => where.id === row.id ? { ...row } : null,
    update: async ({ where, data }: any) => {
      assert.equal(where.id, row.id); updates++;
      Object.assign(row, data); return { ...row };
    },
  };
  const tx = { shipment, $queryRaw: async () => [{ id: row.id }] };
  const db = {
    shipment,
    $transaction: async (action: (value: any) => Promise<any>) => action(tx),
  } as unknown as Pick<PrismaClient, "$transaction" | "shipment">;
  return { db, row, updates: () => updates };
}

test("14-digit Yu-Pri operation timestamp is interpreted as JST and invalid dates fail closed", () => {
  assert.equal(parseYuPriOperationTimestamp("20261013090000")?.toISOString(), "2026-10-13T00:00:00.000Z");
  assert.equal(parseYuPriOperationTimestamp("20260229090000"), null);
  assert.equal(parseYuPriOperationTimestamp("20261301000000"), null);
  assert.equal(parseYuPriOperationTimestamp(""), null);
  assert.equal(parseYuPriOperationTimestamp("2026-10-13"), null);
});

test("acceptance moves LABEL_ISSUED to SHIPPED and persists actualShippedAt once", async () => {
  const f = fixture();
  const first = await syncJapanPostTrackingCsv(f.db, csv(line("11", "01")));
  assert.equal(first[0].outcome, "UPDATED");
  assert.equal(f.row.status, "SHIPPED");
  assert.equal(f.row.actualShippedAt?.toISOString(), "2026-10-13T00:00:00.000Z");
  assert.equal(f.row.deliveredAt, null);
  assert.equal(f.updates(), 1);

  const second = await syncJapanPostTrackingCsv(f.db, csv(line("11", "01")));
  assert.equal(second[0].outcome, "NO_CHANGE");
  assert.equal(f.updates(), 1);
});

test("pre-acceptance status does not invent actualShippedAt", async () => {
  const f = fixture();
  const result = await syncJapanPostTrackingCsv(f.db, csv(line("10", "0A", "")));
  assert.equal(result[0].outcome, "UPDATED");
  assert.equal(f.row.status, "AWAITING_ACCEPTANCE");
  assert.equal(f.row.actualShippedAt, null);
});

test("later transport and delivery preserve acceptance and set delivery completion", async () => {
  const accepted = new Date("2026-10-13T00:00:00.000Z");
  const f = fixture({ status: "SHIPPED", actualShippedAt: accepted });
  let result = await syncJapanPostTrackingCsv(f.db, csv(line("30", "00")));
  assert.equal(result[0].outcome, "UPDATED");
  assert.equal(f.row.status, "IN_TRANSIT");
  assert.equal(f.row.actualShippedAt, accepted);

  result = await syncJapanPostTrackingCsv(f.db, csv(line("52", "01", "20261013090000", "20261014123000")));
  assert.equal(result[0].outcome, "UPDATED");
  assert.equal(f.row.status, "DELIVERED");
  assert.equal(f.row.deliveredAt?.toISOString(), "2026-10-14T03:30:00.000Z");
});

test("invalid or missing required timestamps block every mutation", async () => {
  for (const bad of ["", "20260229090000", "not-a-date"]) {
    const f = fixture();
    const result = await syncJapanPostTrackingCsv(f.db, csv(line("11", "01", bad)));
    assert.equal(result[0].outcome, "SKIPPED");
    assert.match(result[0].errors.at(-1) ?? "", /Acceptance timestamp/);
    assert.equal(f.updates(), 0);
    assert.equal(f.row.status, "LABEL_ISSUED");
  }
  const delivered = fixture({ status: "OUT_FOR_DELIVERY", actualShippedAt: new Date("2026-10-13T00:00:00Z") });
  const result = await syncJapanPostTrackingCsv(delivered.db, csv(line("52", "01", "20261013090000", "")));
  assert.equal(result[0].outcome, "SKIPPED");
  assert.match(result[0].errors.at(-1) ?? "", /Delivery timestamp/);
  assert.equal(delivered.updates(), 0);
});

test("regressions are rejected while EXCEPTION can recover to transport or delivery", async () => {
  assert.equal(canApplyJapanPostState("IN_TRANSIT", "SHIPPED"), false);
  assert.equal(canApplyJapanPostState("OUT_FOR_DELIVERY", "IN_TRANSIT"), false);
  assert.equal(canApplyJapanPostState("EXCEPTION", "IN_TRANSIT"), true);
  assert.equal(canApplyJapanPostState("EXCEPTION", "DELIVERED"), true);

  const stale = fixture({ status: "IN_TRANSIT", actualShippedAt: new Date("2026-10-13T00:00:00Z") });
  const staleResult = await syncJapanPostTrackingCsv(stale.db, csv(line("11", "01")));
  assert.equal(staleResult[0].outcome, "SKIPPED");
  assert.match(staleResult[0].errors.at(-1) ?? "", /regressive/);
  assert.equal(stale.updates(), 0);

  const recovery = fixture({ status: "EXCEPTION", actualShippedAt: new Date("2026-10-13T00:00:00Z") });
  const recoveryResult = await syncJapanPostTrackingCsv(recovery.db, csv(line("30", "00")));
  assert.equal(recoveryResult[0].outcome, "UPDATED");
  assert.equal(recovery.row.status, "IN_TRANSIT");
});
