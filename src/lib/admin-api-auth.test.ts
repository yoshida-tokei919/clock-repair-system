import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const protectedRoutes: Record<string, string[]> = {
  customers: ["GET"],
  "customers/[id]/communications/line": ["POST"],
  "documents/estimate/[id]/line": ["POST"],
  "documents/estimate/[id]/pdf/generate": ["POST"],
  "documents/estimate/[id]/pdf": ["GET"],
  "inquiries/[id]/decision": ["PATCH"],
  "inquiries/[id]/intake-invite": ["POST"],
  "inquiries/[id]/line/files/[fileId]": ["GET"],
  "inquiries/[id]/line": ["GET", "PATCH", "POST"],
  "inquiries/[id]/promotion/customers": ["GET"],
  "inquiries/[id]/promotion": ["POST"],
  "inquiries/[id]/review/master": ["POST"],
  "inquiries/[id]/review": ["GET", "PATCH"],
  invoices: ["GET", "POST"],
  "invoices/preview": ["GET"],
  "invoices/[id]/line": ["POST"],
  "invoices/[id]/payments/manual": ["POST"],
  "invoices/[id]/pdf/generate": ["POST"],
  "invoices/[id]/pdf": ["GET"],
  "invoices/[id]/void": ["POST"],
  partners: ["GET", "POST"],
  "master-data": ["GET", "POST"],
  "masters/pricing": ["GET", "POST"],
  "masters/pricing/[id]": ["PUT", "DELETE"],
  orders: ["GET", "POST"],
  "orders/[id]": ["PUT"],
  parts: ["GET", "POST"],
  "parts/[id]": ["GET", "PUT", "DELETE"],
  "parts/[id]/search-info": ["PATCH"],
  "parts/growth": ["POST"],
  "parts/preview": ["POST"],
  "parts/search": ["GET"],
  "photo-sharing-defaults": ["GET", "PATCH"],
  "physical-tags/resolve": ["POST"],
  "repair-photos/[photoId]": ["GET"],
  repairs: ["POST"],
  "repairs/auto-schedule": ["GET", "POST"],
  "repairs/deadline-capacity-preview": ["GET"],
  "repairs/scheduler-v2-apply": ["POST"],
  "repairs/scheduler-v2-preview": ["GET"],
  "repairs/recent": ["GET"],
  "repairs/[id]": ["PATCH"],
  "repairs/[id]/line": ["GET", "POST"],
  "repairs/[id]/planning": ["GET", "POST"],
  "repairs/[id]/schedule": ["PATCH"],
  "repairs/[id]/work-time-preview/apply": ["POST"],
  "repairs/[id]/work-time-preview": ["GET"],
  "repairs/[id]/status": ["PUT"],
  "repairs/[id]/messages": ["POST"],
  "repairs/[id]/messages/read": ["POST"],
  "repairs/[id]/photo-posting-opt-out": ["POST"],
  "repairs/[id]/photos": ["GET", "POST", "PATCH", "DELETE"],
  "repairs/[id]/public-case": ["POST"],
  "public-cases/[id]": ["PATCH"],
  "settings/procurement/feedback": ["GET"],
  "settings/procurement": ["GET"],
  "settings/procurement/shipping-methods/[id]": ["PUT"],
  "settings/procurement/shipping-methods": ["POST"],
  "settings/procurement/suppliers/[id]": ["PUT"],
  "settings/scheduler/activities/feedback": ["GET"],
  "settings/scheduler/activities": ["PUT"],
  "settings/scheduler/capacity-feedback": ["GET"],
  "settings/scheduler/deadline-feedback-readiness": ["GET"],
  "settings/scheduler": ["GET", "PUT"],
  "settings/scheduler/standards/[id]": ["PUT", "DELETE"],
  "settings/scheduler/standards": ["GET", "POST"],
  "storage-locations/audit": ["POST"],
  "storage-locations/resolve": ["POST"],
  upload: ["POST"],
  "warranties/[id]": ["GET"],
  "work-calendar": ["GET", "PUT"],
  "work-time-sessions/[id]/invalidate": ["POST"],
  "work-time-sessions/[id]": ["PATCH"],
  "work-time-sessions/active": ["GET"],
  "work-time-sessions/start": ["POST"],
  "work-time-sessions/stop": ["POST"],
};

function load(sourcePath: string, modules: Record<string, unknown>): Record<string, any> {
  const source = readFileSync(sourcePath, "utf8");
  const code = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => modules[name] ?? {}, exports);
  return exports;
}

test("admin API guard checks the current Admin record instead of trusting the JWT role", async () => {
  const state = {
    session: null as unknown,
    admin: null as unknown,
    adminLookups: [] as unknown[],
    businessAccesses: 0,
  };
  const business = new Proxy({}, {
    get() {
      state.businessAccesses++;
      throw new Error("business access before authorization");
    },
  });
  const prisma = new Proxy({}, {
    get(_target, property) {
      if (property === "admin") return {
        findUnique: async (query: unknown) => {
          state.adminLookups.push(query);
          return state.admin;
        },
      };
      return business;
    },
  });
  const modules: Record<string, unknown> = {
    "next-auth": { getServerSession: async () => state.session },
    "next/server": {
      NextResponse: {
        json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }),
      },
    },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma },
    "@prisma/client": { PrismaClient: class { constructor() { return prisma; } } },
  };
  const guard = load("src/lib/admin-api-auth.ts", modules);
  modules["@/lib/admin-api-auth"] = guard;

  assert.equal((await guard.requireAdminApi()).status, 401);
  assert.equal(state.adminLookups.length, 0);
  state.session = { user: { role: "ADMIN" } };
  assert.equal((await guard.requireAdminApi()).status, 401);
  assert.equal(state.adminLookups.length, 0);
  state.session = { user: { email: "former@example.test", role: "ADMIN" } };
  assert.equal((await guard.requireAdminApi()).status, 401);
  assert.deepEqual(state.adminLookups.at(-1), {
    where: { email: "former@example.test" }, select: { id: true },
  });
  state.admin = { id: 1 };
  assert.equal(await guard.requireAdminApi(), null);

  for (const [path, methods] of Object.entries(protectedRoutes)) {
    const route = load(`src/app/api/${path}/route.ts`, modules);
    for (const method of methods) {
      const context = { params: Promise.resolve({ id: "1" }) };
      const request = () => new Request(`http://localhost/api/${path}`, {
        method, body: method === "GET" ? undefined : "{invalid json",
      });
      state.session = null;
      state.admin = null;
      state.businessAccesses = 0;
      const before: number = state.adminLookups.length;
      assert.equal((await route[method](request(), context)).status, 401, `${path} ${method}: no session`);
      assert.equal(state.adminLookups.length, before, `${path} ${method}: no Admin query without email`);
      assert.equal(state.businessAccesses, 0, `${path} ${method}: no business query`);

      state.session = { user: { email: "former@example.test", role: "ADMIN" } };
      assert.equal((await route[method](request(), context)).status, 401, `${path} ${method}: stale JWT`);
      assert.equal(state.adminLookups.length, before + 1, `${path} ${method}: Admin queried`);
      assert.equal(state.businessAccesses, 0, `${path} ${method}: no business query`);

      state.admin = { id: 1 };
      let activeResponse: { status: number } | undefined;
      const originalConsoleError = console.error;
      console.error = () => {};
      try {
        activeResponse = await route[method](request(), context);
      } catch {
        // The business path can reach an unmocked dependency after authorization.
      } finally {
        console.error = originalConsoleError;
      }
      assert.equal(state.adminLookups.length, before + 2, `${path} ${method}: active Admin checked`);
      if (activeResponse) assert.notEqual(activeResponse.status, 401, `${path} ${method}: active Admin proceeds`);
    }
  }

  state.admin = { id: 1 };
  state.session = { user: { email: "active@example.test" } };
  const invoices = load("src/app/api/invoices/route.ts", modules);
  const response = await invoices.POST(new Request("http://localhost/api/invoices", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  }));
  assert.equal(response.status, 400, "active Admin reaches invoice validation");
  assert.deepEqual(state.adminLookups.at(-1), {
    where: { email: "active@example.test" }, select: { id: true },
  });
});

test("token, webhook, internal and utility routes remain outside the Admin guard", () => {
  for (const path of [
    "auth/[...nextauth]", "line/webhook", "stripe/webhook",
    "internal/line-inbox/process",
    "customer/delivery/[token]", "customer/intake/[token]",
    "customer/invoices/[token]/checkout", "customer/repairs/[id]/prepayments/[paymentId]/checkout",
    "exchange-rate", "postal-code",
  ]) {
    const source = readFileSync(`src/app/api/${path}/route.ts`, "utf8");
    assert.doesNotMatch(source, /requireAdminApi/, path);
  }
});

test("public case images stay public only when published and approved", async () => {
  let session: unknown = null;
  let admin: unknown = null;
  let adminLookups = 0;
  let image = {
    storagePath: "legacy",
    url: "https://example.test/image.jpg",
    publicCase: { b2cPublishStatus: "PUBLISHED", reviewStatus: "APPROVED" },
  };
  const prisma = {
    publicCaseImage: { findUnique: async () => image },
    admin: { findUnique: async () => { adminLookups++; return admin; } },
  };
  const route = load("src/app/api/public-case-images/[imageId]/route.ts", {
    "next-auth": { getServerSession: async () => session },
    "next/server": {
      NextResponse: {
        json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }),
        redirect: (url: string) => ({ status: 307, url }),
      },
    },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma },
    "@/lib/r2-repair-photos": { isR2PublicCasePhotoKey: () => false },
    "@/lib/admin-api-auth": load("src/lib/admin-api-auth.ts", {
      "next-auth": { getServerSession: async () => session },
      "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
      "@/lib/auth": { authOptions: {} },
      "@/lib/prisma": { prisma },
    }),
  });
  const get = () => route.GET(new Request("http://localhost/api/public-case-images/1"), { params: Promise.resolve({ imageId: "1" }) });

  assert.equal((await get()).status, 307);
  assert.equal(adminLookups, 0);
  image = { ...image, publicCase: { b2cPublishStatus: "DRAFT", reviewStatus: "APPROVED" } };
  assert.equal((await get()).status, 401);
  assert.equal(adminLookups, 0);
  session = { user: { email: "former@example.test", role: "ADMIN" } };
  assert.equal((await get()).status, 401);
  assert.equal(adminLookups, 1);
  admin = { id: 1 };
  assert.equal((await get()).status, 307);
  assert.equal(adminLookups, 2);
});
