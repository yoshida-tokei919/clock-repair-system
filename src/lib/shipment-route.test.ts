import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

async function route(entry: string, modules: Record<string, string>) {
  const plugin: Plugin = { name: "shipment-route-stubs", setup(api) {
    api.onResolve({ filter: /^(?:next-auth|next\/server|@\/lib\/)/ }, args => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: modules[args.path], loader: "js" }));
  } };
  const built = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", write: false, plugins: [plugin] });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
}

const state = globalThis as typeof globalThis & { __shipmentSession: any; __shipmentAdmin: boolean;
  __shipmentJsonReads: number; __shipmentCreates: number; __shipmentReads: number; __shipmentUpdates: number;
  __shipmentAdminReads: number; __shipmentParses: number; __shipmentUpdateParses: number };
const response = "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };";
const common = {
  "next-auth": "export const getServerSession = async () => globalThis.__shipmentSession;",
  "next/server": response,
  "@/lib/auth": "export const authOptions = {};",
  "@/lib/prisma": "export const prisma = { admin: { findUnique: async () => { globalThis.__shipmentAdminReads++; return globalThis.__shipmentAdmin ? { id: 1 } : null; } } };",
  "@/lib/shipment": [
    "export const shipmentFailure = error => ({ status: 400, message: error.message });",
    "export const parseShipmentCreate = value => { globalThis.__shipmentParses++; if (value.confirmed !== true) throw Error('confirmation required'); return value; };",
    "export const createShipment = async () => { globalThis.__shipmentCreates++; return { id: 1 }; };",
    "export const shipmentId = value => { if (value !== '1') throw Error('bad ID'); return 1; };",
    "export const parseShipmentUpdate = value => { globalThis.__shipmentUpdateParses++; if (value.status) throw Error('bad field'); return value; };",
    "export const readShipment = async () => { globalThis.__shipmentReads++; return { id: 1 }; };",
    "export const updateShipment = async () => { globalThis.__shipmentUpdates++; return { id: 1 }; };",
  ].join("\n"),
};

test("create route requires session, confirmation, and real Admin before mutation", async () => {
  const target = await route("src/app/api/shipments/route.ts", common);
  state.__shipmentSession = null; state.__shipmentAdmin = true;
  state.__shipmentJsonReads = 0; state.__shipmentCreates = 0;
  state.__shipmentAdminReads = 0; state.__shipmentParses = 0;
  let body: any = { repairIds: [1], confirmed: true };
  const request = { json: async () => { state.__shipmentJsonReads++; return body; } };
  assert.equal((await target.POST(request)).status, 401);
  assert.equal(state.__shipmentJsonReads, 0);
  assert.equal(state.__shipmentAdminReads, 0);
  assert.equal(state.__shipmentParses, 0);
  state.__shipmentSession = { user: { email: "admin@example.com" } };
  state.__shipmentAdmin = false;
  assert.equal((await target.POST(request)).status, 401);
  assert.equal(state.__shipmentJsonReads, 0);
  assert.equal(state.__shipmentAdminReads, 1);
  assert.equal(state.__shipmentParses, 0);
  assert.equal(state.__shipmentCreates, 0);
  state.__shipmentAdmin = true;
  body = { repairIds: [1] };
  assert.equal((await target.POST(request)).status, 400);
  assert.equal(state.__shipmentJsonReads, 1);
  assert.equal(state.__shipmentParses, 1);
  assert.equal(state.__shipmentCreates, 0);
  body = { repairIds: [1], confirmed: true };
  state.__shipmentAdmin = false;
  assert.equal((await target.POST(request)).status, 401);
  assert.equal(state.__shipmentJsonReads, 1);
  assert.equal(state.__shipmentParses, 1);
  assert.equal(state.__shipmentCreates, 0);
  state.__shipmentAdmin = true;
  assert.equal((await target.POST(request)).status, 201);
  assert.equal(state.__shipmentCreates, 1);
});

test("detail read and update require a real Admin and reject unsafe updates", async () => {
  const target = await route("src/app/api/shipments/[id]/route.ts", common);
  state.__shipmentSession = null; state.__shipmentAdmin = true;
  state.__shipmentReads = 0; state.__shipmentUpdates = 0;
  state.__shipmentJsonReads = 0; state.__shipmentAdminReads = 0; state.__shipmentUpdateParses = 0;
  const context = { params: Promise.resolve({ id: "1" }) };
  const request = { json: async () => { state.__shipmentJsonReads++; return { carrierCode: "JP" }; } };
  assert.equal((await target.GET(request, context)).status, 401);
  assert.equal((await target.PATCH(request, context)).status, 401);
  assert.equal(state.__shipmentJsonReads, 0);
  assert.equal(state.__shipmentAdminReads, 0);
  assert.equal(state.__shipmentUpdateParses, 0);
  state.__shipmentSession = { user: { email: "admin@example.com" } };
  state.__shipmentAdmin = false;
  assert.equal((await target.GET(request, context)).status, 401);
  assert.equal((await target.PATCH(request, context)).status, 401);
  assert.equal(state.__shipmentJsonReads, 0);
  assert.equal(state.__shipmentAdminReads, 2);
  assert.equal(state.__shipmentUpdateParses, 0);
  state.__shipmentAdmin = true;
  assert.equal((await target.GET(request, context)).status, 200);
  assert.equal(state.__shipmentReads, 1);
  assert.equal((await target.PATCH({ json: async () => ({ status: "SHIPPED" }) }, context)).status, 400);
  assert.equal(state.__shipmentUpdates, 0);
  assert.equal((await target.PATCH(request, context)).status, 200);
  assert.equal(state.__shipmentJsonReads, 1);
  assert.equal(state.__shipmentUpdateParses, 2);
  assert.equal(state.__shipmentUpdates, 1);
});
