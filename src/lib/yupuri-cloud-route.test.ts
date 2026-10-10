import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as ts from "typescript";

const state = globalThis as typeof globalThis & {
  __ycSession: { user: { email: string } } | null;
  __ycAdmin: boolean;
  __ycShipment: { id: number } | null;
  __ycAdminReads: number;
  __ycShipmentReads: number;
  __ycExports: number;
  __ycErrorStatus: 409 | 422 | null;
  __ycSelect: Record<string, boolean> | null;
  __ycIssueCalls: number;
};

async function route() {
  class YupuriCloudError extends Error {
    constructor(message: string, readonly status: 409 | 422 = 422) { super(message); }
  }

  const modules: Record<string, unknown> = {
    "next-auth": { getServerSession: async () => state.__ycSession },
    "next/server": {
      NextResponse: {
        json: (body: unknown, options?: { status: number }) => ({ body, status: options?.status ?? 200 }),
      },
    },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": {
      prisma: {
        admin: {
          findUnique: async () => {
            state.__ycAdminReads++;
            return state.__ycAdmin ? { id: 1 } : null;
          },
        },
        shipment: {
          findUnique: async (query: { select: Record<string, boolean> }) => {
            state.__ycShipmentReads++;
            state.__ycSelect = query.select;
            return state.__ycShipment;
          },
        },
      },
    },
    "@/lib/shipment": {
      shipmentId: (value: string) => {
        if (!/^\d+$/.test(value) || Number(value) < 1) throw { status: 400, message: "bad id" };
        return Number(value);
      },
      shipmentFailure: (error: { status?: number; message: string }) => ({
        status: error.status ?? 500,
        message: error.message,
      }),
    },
    "@/lib/yupuri-cloud": {
      YupuriCloudError,
      yupuriCloudCsv: () => {
        state.__ycExports++;
        if (state.__ycErrorStatus) throw new YupuriCloudError("invalid export", state.__ycErrorStatus);
        return Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from("送り状種別\r\n0\r\n", "utf8"),
        ]);
      },
    },
    "@/lib/yupuri-cloud-issuance": {
      cloudIssueFailure: (error: { status?: number; message: string }) => ({ status: error.status ?? 500, message: error.message }),
      parseIssueRequest: (body: { confirmed?: boolean }) => {
        if (body.confirmed !== true) throw { status: 400, message: "confirmation required" };
        return { confirmed: true };
      },
      requestCloudIssue: async () => { state.__ycIssueCalls++; return { status: "READY" }; },
    },
  };

  const source = readFileSync("src/app/api/shipments/[id]/yupuri-cloud/route.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const requireStub = (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected route import: ${name}`);
    return modules[name];
  };
  new Function("require", "module", "exports", compiled)(requireStub, module, module.exports);
  return module.exports as {
    GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
    POST: (request: { json(): Promise<unknown> }, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
}

test("Cloud issuance POST checks Admin and explicit confirmation before mutation", async () => {
  const target = await route();
  const context = { params: Promise.resolve({ id: "42" }) };
  state.__ycSession = null; state.__ycAdmin = true; state.__ycIssueCalls = 0;
  let reads = 0;
  const body = { json: async () => { reads++; return { confirmed: true }; } };
  assert.equal((await target.POST(body, context)).status, 401);
  assert.equal(reads, 0);
  state.__ycSession = { user: { email: "admin@example.com" } }; state.__ycAdmin = false;
  assert.equal((await target.POST(body, context)).status, 401);
  assert.equal(reads, 0);
  state.__ycAdmin = true;
  assert.equal((await target.POST(body, { params: Promise.resolve({ id: "bad" }) })).status, 400);
  assert.equal(reads, 0);
  assert.equal((await target.POST({ json: async () => ({ confirmed: false }) }, context)).status, 400);
  assert.equal(state.__ycIssueCalls, 0);
  assert.equal((await target.POST(body, context)).status, 200);
  assert.equal(state.__ycIssueCalls, 1);
});

test("Cloud download requires Admin, performs one read-only Shipment lookup, and returns UTF-8 BOM CSV", async () => {
  const target = await route();
  const context = { params: Promise.resolve({ id: "42" }) };

  state.__ycSession = null;
  state.__ycAdmin = true;
  state.__ycShipment = { id: 42 };
  state.__ycAdminReads = 0;
  state.__ycShipmentReads = 0;
  state.__ycExports = 0;
  state.__ycErrorStatus = null;
  state.__ycSelect = null;

  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 401);
  assert.equal(state.__ycAdminReads, 0);

  state.__ycSession = { user: { email: "admin@example.com" } };
  state.__ycAdmin = false;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 401);
  assert.equal(state.__ycShipmentReads, 0);

  state.__ycAdmin = true;
  assert.equal((await target.GET(
    new Request("http://localhost"),
    { params: Promise.resolve({ id: "bad" }) },
  )).status, 400);
  assert.equal(state.__ycShipmentReads, 0);

  state.__ycShipment = null;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 404);
  assert.equal(state.__ycExports, 0);

  state.__ycShipment = { id: 42 };
  state.__ycErrorStatus = 409;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 409);
  state.__ycErrorStatus = 422;
  assert.equal((await target.GET(new Request("http://localhost"), context)).status, 422);

  state.__ycErrorStatus = null;
  const response = await target.GET(new Request("http://localhost"), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=UTF-8");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="yupuri-cloud-shipment-42.csv"');
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), true);
  assert.equal(bytes.subarray(3).toString("utf8"), "送り状種別\r\n0\r\n");

  assert.deepEqual(Object.keys(state.__ycSelect ?? {}).sort(), [
    "id",
    "direction",
    "status",
    "actualShippedAt",
    "plannedShipDate",
    "requestedDeliveryDate",
    "requestedDeliveryTimeSlot",
    "destinationRecipientName",
    "destinationPostalCode",
    "destinationPrefecture",
    "destinationCity",
    "destinationStreet",
    "destinationBuilding",
    "destinationPhone",
  ].sort());
  assert.equal(Object.values(state.__ycSelect ?? {}).every(value => value === true), true);
  assert.equal(state.__ycShipmentReads, 4);
  assert.equal(state.__ycExports, 3);
});
