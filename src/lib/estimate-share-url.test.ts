import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { issueEstimateShareUrl, parseEstimateDocumentId, trustedEstimateOrigin, EstimateShareNotFoundError, EstimateShareUnavailableError } from "./estimate-share-url";
import { REOPEN_EVENT_PREFIX } from "./repair-reopen-approval";

const testOrigin = "https://example.test";

test("document ID accepts only a safe positive decimal integer", () => {
  assert.equal(parseEstimateDocumentId("5"), 5);
  for (const invalid of ["0", "-1", "1.5", "1e2", "01", "abc", "9007199254740992"]) {
    assert.equal(parseEstimateDocumentId(invalid), null);
  }
});

function fixture() {
  const state = {
    customerType: "business", customerId: 4, token: null as string | null,
    repairs: [{ id: 2, customerId: 4 }, { id: 3, customerId: 4 }],
    lockedRepairIds: [2, 3],
    repairTokens: { 2: null, 3: null } as Record<number, string | null>,
    repairWriteIds: [] as number[], repairUpdateFailureId: null as number | null,
    pdf: { status: "current", storageKey: "pdf-key", estimateDocumentId: 5 } as
      { status: string; storageKey: string; estimateDocumentId: number } | null,
    writes: 0, lineWrites: 0, attempts: 0, conflicts: 0,
    options: null as { timeout: number; maxWait: number } | null,
    archived: false,
  };
  let tail = Promise.resolve();
  const tx = {
    repairStatusLog: { findMany: async () => state.archived
      ? [{ status: `${REOPEN_EVENT_PREFIX}v2:5:5:0:0:0:0:E` }] : [] },
    estimateDocument: { findUnique: async ({ select }: { select: { customerId?: boolean } }) =>
      state.customerId === 0 ? null : select.customerId && Object.keys(select).length === 1
        ? { customerId: state.customerId }
        : { customerId: state.customerId, repairs: state.repairs, currentPdfFile: state.pdf } },
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "Customer"')) return [{ id: state.customerId, type: state.customerType }];
      if (sql.includes('FROM "EstimateDocument"')) return [{ customerId: state.customerId, publicToken: state.token }];
      if (sql.includes('FROM "Repair"')) return state.lockedRepairIds.map((id) => ({ id, publicToken: state.repairTokens[id] }));
      throw new Error(`Unexpected query: ${sql}`);
    },
    $executeRaw: async (parts: TemplateStringsArray, token: string, id?: number) => {
      state.writes++;
      if (parts.join("?").includes('UPDATE "Repair"')) {
        assert.ok(id !== undefined);
        state.repairWriteIds.push(id);
        if (state.repairUpdateFailureId === id || state.repairTokens[id]) return 0;
        state.repairTokens[id] = token;
        return 1;
      }
      if (state.token) return 0;
      state.token = token;
      return 1;
    },
  };
  const db = {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>, options: { timeout: number; maxWait: number }) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        state.attempts++;
        state.options = options;
        if (state.conflicts-- > 0) throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
        return await fn(tx);
      } finally { release(); }
    },
  };
  return { state, db: db as any };
}

test("archived grouped document cannot issue another share URL, while a new document can", async () => {
  const old = fixture();
  old.state.archived = true;
  await assert.rejects(issueEstimateShareUrl(old.db, 5, "https://example.test", testOrigin), /履歴/);
  assert.equal(old.state.writes, 0);
  const fresh = fixture();
  fresh.state.archived = true; // The event names document 5, not this new document.
  fresh.state.pdf!.estimateDocumentId = 6;
  await assert.doesNotReject(() => issueEstimateShareUrl(fresh.db, 6, "https://example.test", testOrigin));
});

test("new document and linked repairs receive 24-byte base64url tokens, without LINE writes", async () => {
  const f = fixture();
  const result = await issueEstimateShareUrl(f.db, 5, "https://evil.test/api/documents/estimate/5/share-url", testOrigin);
  assert.match(result.url, /^https:\/\/example\.test\/customer\/repairs\/[A-Za-z0-9_-]{32}$/);
  assert.equal(result.url.split("/").at(-1), f.state.token);
  for (const token of Object.values(f.state.repairTokens)) assert.match(token!, /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(f.state.repairWriteIds, [2, 3]);
  assert.equal(f.state.writes, 3);
  assert.equal(f.state.lineWrites, 0);
  assert.equal(f.state.options?.timeout, 30000);
  assert.equal(f.state.options?.maxWait, 10000);
});

test("existing document and repair tokens are reused without a write, including simultaneous requests", async () => {
  const f = fixture();
  f.state.token = "existing-token";
  f.state.repairTokens[2] = "existing-repair-2";
  f.state.repairTokens[3] = "existing-repair-3";
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    issueEstimateShareUrl(f.db, 5, "https://evil.test/request", testOrigin)));
  assert.deepEqual(results, Array(8).fill({ url: "https://example.test/customer/repairs/existing-token" }));
  assert.equal(f.state.writes, 0);
});

test("an existing document token still issues only missing repair tokens", async () => {
  const f = fixture();
  f.state.token = "existing-token";
  f.state.repairTokens[2] = "existing-repair-2";
  const result = await issueEstimateShareUrl(f.db, 5, "https://evil.test/request", testOrigin);
  assert.equal(result.url, `${testOrigin}/customer/repairs/existing-token`);
  assert.equal(f.state.repairTokens[2], "existing-repair-2");
  assert.match(f.state.repairTokens[3]!, /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(f.state.repairWriteIds, [3]);
  assert.equal(f.state.writes, 1);
});

test("simultaneous first requests issue once and reuse one token", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    issueEstimateShareUrl(f.db, 5, "https://evil.test/request", testOrigin)));
  assert.equal(new Set(results.map((result) => result.url)).size, 1);
  assert.equal(f.state.writes, 3);
  assert.deepEqual(f.state.repairWriteIds, [2, 3]);
});

test("a failed conditional repair token update does not return the document URL", async () => {
  const f = fixture();
  f.state.repairUpdateFailureId = 3;
  await assert.rejects(issueEstimateShareUrl(f.db, 5, "https://evil.test/request", testOrigin), EstimateShareUnavailableError);
});

test("missing document, non-business customer, repair mismatch or empty set, and invalid PDF fail closed", async () => {
  const changes = [
    (f: ReturnType<typeof fixture>) => { f.state.customerId = 0; },
    (f: ReturnType<typeof fixture>) => { f.state.customerType = "individual"; },
    (f: ReturnType<typeof fixture>) => { f.state.repairs = []; f.state.lockedRepairIds = []; },
    (f: ReturnType<typeof fixture>) => { f.state.repairs[1].customerId = 9; },
    (f: ReturnType<typeof fixture>) => { f.state.lockedRepairIds = [2]; },
    (f: ReturnType<typeof fixture>) => { f.state.pdf = null; },
    (f: ReturnType<typeof fixture>) => { f.state.pdf!.status = "superseded"; },
    (f: ReturnType<typeof fixture>) => { f.state.pdf!.storageKey = " "; },
    (f: ReturnType<typeof fixture>) => { f.state.pdf!.estimateDocumentId = 6; },
  ];
  for (const [index, change] of changes.entries()) {
    const f = fixture(); change(f);
    await assert.rejects(issueEstimateShareUrl(f.db, 5, "https://evil.test", testOrigin),
      index === 0 ? EstimateShareNotFoundError : EstimateShareUnavailableError);
    assert.equal(f.state.writes, 0);
  }
});

test("only a strict public origin is accepted; request host cannot receive the token", async () => {
  assert.equal(trustedEstimateOrigin(testOrigin), testOrigin);
  assert.equal(trustedEstimateOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const invalid of [undefined, "http://example.test", "https://user:pass@example.test",
    "https://example.test/path", "https://example.test?", "https://example.test#",
    "https://example.test/?key=x", "https://example.test/#part", "not-a-url"]) {
    assert.equal(trustedEstimateOrigin(invalid), "https://yoshidawatchrepair.com");
  }
  const f = fixture();
  const result = await issueEstimateShareUrl(f.db, 5, "https://hostile.test/steal", "https://user@trusted.test");
  assert.match(result.url, /^https:\/\/yoshidawatchrepair\.com\/customer\/repairs\//);
  assert.doesNotMatch(result.url, /hostile\.test|trusted\.test/);
});

test("transient P2034 re-reads a committed token and arbitrary errors are not retried", async () => {
  const f = fixture();
  f.state.token = "committed-token";
  f.state.repairTokens[2] = "committed-repair-2";
  f.state.repairTokens[3] = "committed-repair-3";
  f.state.conflicts = 1;
  const result = await issueEstimateShareUrl(f.db, 5, "https://hostile.test", testOrigin);
  assert.equal(result.url, `${testOrigin}/customer/repairs/committed-token`);
  assert.equal(f.state.attempts, 2);
  assert.equal(f.state.writes, 0);

  const failed = fixture();
  failed.state.conflicts = 3;
  await assert.rejects(issueEstimateShareUrl(failed.db, 5, "https://hostile.test", testOrigin),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2034");
  assert.equal(failed.state.attempts, 3);
  assert.equal(failed.state.writes, 0);
  const other = fixture();
  other.state.customerType = "individual";
  await assert.rejects(issueEstimateShareUrl(other.db, 5, "https://hostile.test", testOrigin), EstimateShareUnavailableError);
  assert.equal(other.state.attempts, 1);
});

test("route guards admin before input and has no LINE queue dependency", () => {
  const source = readFileSync("src/app/api/documents/estimate/[id]/share-url/route.ts", "utf8");
  assert.ok(source.indexOf("await requireAdminApi()") < source.indexOf("(await params).id"));
  assert.doesNotMatch(source, /queueEstimateLineSend|lineManagerSendOutbox|createApprovedLineManagerSendOutbox/);
  assert.match(source, /parseEstimateDocumentId/);
  assert.match(source, /P2034/);
  assert.match(source, /no-store/);
});
