import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as ts from "typescript";

const state = globalThis as typeof globalThis & {
  __yvSession: { user: { email: string } } | null;
  __yvAdmin: boolean;
  __yvShipment: { id: number } | null;
  __yvAdminReads: number;
  __yvShipmentReads: number;
  __yvExports: number;
  __yvErrorStatus: 409 | 422 | null;
  __yvSelect: Record<string, boolean> | null;
};

async function route() {
  class YupuriV3Error extends Error {
    constructor(message: string, readonly status: 409 | 422 = 422) { super(message); }
  }
  const modules: Record<string, unknown> = {
    "next-auth": { getServerSession: async () => state.__yvSession },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) =>
      ({ body, status: options?.status ?? 200 }) } },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma: {
      admin: { findUnique: async () => { state.__yvAdminReads++; return state.__yvAdmin ? { id: 1 } : null; } },
      shipment: { findUnique: async (query: { select: Record<string, boolean> }) => {
        state.__yvShipmentReads++; state.__yvSelect = query.select; return state.__yvShipment;
      } },
    } },
    "@/lib/shipment": {
      shipmentId: (value: string) => {
        if (!/^\d+$/.test(value) || Number(value) < 1) throw { status: 400, message: "bad id" };
        return Number(value);
      },
      shipmentFailure: (error: { status?: number; message: string }) =>
        ({ status: error.status ?? 500, message: error.message }),
    },
    "@/lib/yupuri-v3": {
      YupuriV3Error,
      yupuriV3Csv: () => {
        state.__yvExports++;
        if (state.__yvErrorStatus) throw new YupuriV3Error("invalid export", state.__yvErrorStatus);
        return Buffer.from("SHP-42\r\n");
      },
    },
  };
  const source = readFileSync("src/app/api/shipments/[id]/yupuri-v3/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const requireStub = (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected route import: ${name}`);
    return modules[name];
  };
  new Function("require", "module", "exports", compiled)(requireStub, module, module.exports);
  return module.exports as { GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
}

test("download requires session and Admin, reads one Shipment, and never mutates it", async () => {
  const target = await route();
  const context = { params: Promise.resolve({ id: "42" }) };
  state.__yvSession = null; state.__yvAdmin = true; state.__yvShipment = { id: 42 };
  state.__yvAdminReads = 0; state.__yvShipmentReads = 0; state.__yvExports = 0;
  state.__yvErrorStatus = null; state.__yvSelect = null;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 401);
  assert.equal(state.__yvAdminReads, 0);
  state.__yvSession = { user: { email: "admin@example.com" } }; state.__yvAdmin = false;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 401);
  assert.equal(state.__yvShipmentReads, 0);
  state.__yvAdmin = true;
  assert.equal((await target.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "bad" }) })).status, 400);
  assert.equal(state.__yvShipmentReads, 0);
  state.__yvShipment = null;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 404);
  assert.equal(state.__yvExports, 0);
  state.__yvShipment = { id: 42 }; state.__yvErrorStatus = 409;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 409);
  state.__yvErrorStatus = 422;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 422);
  state.__yvErrorStatus = null;
  const response: Response = await target.GET(new Request("http://localhost"), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=Shift_JIS");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="yupuri-v3-shipment-42.csv"');
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), "SHP-42\r\n");
  assert.deepEqual(Object.keys(state.__yvSelect ?? {}).sort(), [
    "id", "direction", "status", "actualShippedAt", "plannedShipDate",
    "requestedDeliveryDate", "requestedDeliveryTimeSlot", "destinationRecipientName",
    "destinationPostalCode", "destinationPrefecture", "destinationCity",
    "destinationStreet", "destinationBuilding", "destinationPhone",
  ].sort());
  assert.equal(Object.values(state.__yvSelect ?? {}).every(value => value === true), true);
  assert.equal(state.__yvShipmentReads, 4);
  assert.equal(state.__yvExports, 3);
});
