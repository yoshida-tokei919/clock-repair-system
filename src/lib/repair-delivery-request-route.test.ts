import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

async function route(modules: Record<string, string>) {
  const plugin: Plugin = { name: "repair-delivery-route-stubs", setup(api) {
    api.onResolve({ filter: /^(?:next-auth|next\/server|@\/lib\/)/ }, args => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: modules[args.path], loader: "js" }));
  } };
  const built = await build({ entryPoints: ["src/app/api/repairs/[id]/delivery-shipments/route.ts"], bundle: true,
    platform: "node", format: "esm", write: false, plugins: [plugin] });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
}

const state = globalThis as typeof globalThis & {
  __deliverySession: any; __deliveryAdmin: boolean; __deliveryReads: number;
};
const modules = {
  "next-auth": "export const getServerSession = async () => globalThis.__deliverySession;",
  "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
  "@/lib/auth": "export const authOptions = {};",
  "@/lib/prisma": "export const prisma = { admin: { findUnique: async () => globalThis.__deliveryAdmin ? { id: 1 } : null } };",
  "@/lib/repair-delivery-request": [
    "export class RepairDeliveryRequestNotFoundError extends Error {};",
    "export const getRepairDeliveryShipments = async (_db, id) => { globalThis.__deliveryReads++; if (id === 404) throw new RepairDeliveryRequestNotFoundError('Repair not found'); return [{ id: 9 }]; };",
  ].join("\n"),
  "@/lib/repair-delivery-preference": "export const getRepairDeliveryPreferenceForAdmin = async () => ({ applicationStatus: 'UNANSWERED', preference: null });",
  "@/lib/yupuri-v3": "export const YUPURI_DELIVERY_TIME_OPTIONS = [{ value: '指定なし', label: '指定なし' }];",
};

test("delivery shipment candidates require a real Admin and validate Repair ID", async () => {
  const target = await route(modules);
  state.__deliveryReads = 0; state.__deliverySession = null; state.__deliveryAdmin = true;
  assert.equal((await target.GET({}, { params: Promise.resolve({ id: "8" }) })).status, 401);
  state.__deliverySession = { user: { email: "admin@example.com" } }; state.__deliveryAdmin = false;
  assert.equal((await target.GET({}, { params: Promise.resolve({ id: "8" }) })).status, 401);
  state.__deliveryAdmin = true;
  assert.equal((await target.GET({}, { params: Promise.resolve({ id: "x" }) })).status, 400);
  assert.equal(state.__deliveryReads, 0);
});

test("delivery shipment candidate read returns options and maps missing Repair to 404", async () => {
  const target = await route(modules);
  state.__deliverySession = { user: { email: "admin@example.com" } }; state.__deliveryAdmin = true; state.__deliveryReads = 0;
  const ok = await target.GET({}, { params: Promise.resolve({ id: "8" }) });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, {
    shipments: [{ id: 9 }],
    customerResponse: { applicationStatus: "UNANSWERED", preference: null },
    timeOptions: [{ value: "指定なし", label: "指定なし" }],
  });
  assert.equal((await target.GET({}, { params: Promise.resolve({ id: "404" }) })).status, 404);
  assert.equal(state.__deliveryReads, 2);
});
