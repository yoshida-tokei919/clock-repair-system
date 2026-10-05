import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as iconv from "iconv-lite";
import * as ts from "typescript";
import { parseYupuriHistory, resolveYupuriHistory, YUPURI_HISTORY_HEADER } from "./yupuri-history";

const state = globalThis as typeof globalThis & {
  __yhSession: { user: { email: string } } | null;
  __yhAdmin: boolean;
  __yhAdminReads: number;
  __yhShipmentReads: number;
  __yhMutations: number;
  __yhFileReads: number;
};

async function route() {
  const readOnly = (target: Record<string, unknown>) => new Proxy(target, {
    get(object, property) {
      if (typeof property === "string" && /^(create|update|upsert|delete|createMany|updateMany|deleteMany|\$transaction|\$executeRaw|\$queryRaw)/.test(property)) {
        state.__yhMutations++;
        throw new Error("DB mutation attempted");
      }
      return Reflect.get(object, property);
    },
  });
  const modules: Record<string, unknown> = {
    "next-auth": { getServerSession: async () => state.__yhSession },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number; headers?: Record<string, string> }) =>
      ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma: readOnly({
      admin: readOnly({ findUnique: async (query: { where: { email: string }; select: { id: boolean } }) => {
        assert.deepEqual(query, { where: { email: "admin@example.com" }, select: { id: true } });
        state.__yhAdminReads++; return state.__yhAdmin ? { id: 1 } : null;
      } }),
      shipment: readOnly({ findMany: async (query: { where: { id: { in: number[] } }; select: Record<string, boolean> }) => {
        state.__yhShipmentReads++;
        assert.deepEqual(query.where, { id: { in: [42] } });
        assert.deepEqual(query.select, { id: true, direction: true, status: true, trackingNumber: true,
          actualShippedAt: true, deliveredAt: true });
        return [{ id: 42, direction: "OUTBOUND", status: "DRAFT", trackingNumber: null,
          actualShippedAt: new Date("2026-01-01T00:00:00.000Z"), deliveredAt: null }];
      } }),
    }) },
    "@/lib/yupuri-history": { parseYupuriHistory, resolveYupuriHistory, YUPURI_HISTORY_MAX_BYTES: 256 * 1024,
      YupuriHistoryError: class YupuriHistoryError extends Error {} },
  };
  const source = readFileSync("src/app/api/shipments/yupuri-history/preview/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected route import: ${name}`);
    return modules[name];
  }, module, module.exports);
  return module.exports as { POST: (request: { formData: () => Promise<FormData> }) => Promise<{
    body: { rows?: ReturnType<typeof resolveYupuriHistory> }; status: number; headers?: Record<string, string>;
  }> };
}

test("preview requires session and matching Admin, then only reads Shipments", async () => {
  const target = await route();
  const header = YUPURI_HISTORY_HEADER.map(value => `"${value}"`).join(",");
  const csv = `${header}\r\n"SHP-42","193715301010","","","10","0A"\r\n`;
  const request = { formData: async () => {
    state.__yhFileReads++;
    const form = new FormData();
    form.set("file", new File([Uint8Array.from(iconv.encode(csv, "cp932"))], "shipping_history.csv"));
    return form;
  } };
  state.__yhSession = null; state.__yhAdmin = true;
  state.__yhAdminReads = 0; state.__yhShipmentReads = 0; state.__yhMutations = 0; state.__yhFileReads = 0;
  assert.equal((await target.POST(request)).status, 401);
  assert.equal(state.__yhAdminReads, 0);
  assert.equal(state.__yhFileReads, 0);
  state.__yhSession = { user: { email: "admin@example.com" } }; state.__yhAdmin = false;
  assert.equal((await target.POST(request)).status, 401);
  assert.equal(state.__yhFileReads, 0);
  assert.equal(state.__yhShipmentReads, 0);
  state.__yhAdmin = true;
  assert.equal((await target.POST({ formData: async () => new FormData() })).status, 400);
  assert.equal((await target.POST({ formData: async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(256 * 1024 + 1)], "too-large.csv"));
    return form;
  } })).status, 413);
  assert.equal(state.__yhShipmentReads, 0);
  const invalidId = await target.POST({ formData: async () => {
    const form = new FormData();
    form.set("file", new File([Uint8Array.from(iconv.encode(`${header}\r\n"POC003","193715301010","","","10","0A"\r\n`, "cp932"))], "shipping_history.csv"));
    return form;
  } });
  assert.equal(invalidId.body.rows?.[0].resolvedShipmentId, null);
  assert.equal(state.__yhShipmentReads, 0);
  const response = await target.POST(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers?.["Cache-Control"], "no-store");
  assert.equal(response.body.rows?.[0].shipmentFound, true);
  assert.deepEqual(response.body.rows?.[0].currentShipment, {
    id: 42, direction: "OUTBOUND", status: "DRAFT", trackingNumber: null,
    actualShippedAt: "2026-01-01T00:00:00.000Z", deliveredAt: null,
  });
  assert.equal(response.body.rows?.[0].statusCandidate, "AWAITING_ACCEPTANCE");
  assert.equal(response.body.rows?.[0].importableLater, true);
  assert.equal(state.__yhShipmentReads, 1);
  assert.equal(state.__yhMutations, 0);
});
