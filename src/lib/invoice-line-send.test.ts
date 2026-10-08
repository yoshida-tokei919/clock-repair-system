import assert from "node:assert/strict";
import test from "node:test";
import { sendInvoiceLine } from "./invoice-line-send";

const FIRST_KEY = "11111111-1111-4111-8111-111111111111";
const SECOND_KEY = "22222222-2222-4222-8222-222222222222";

function fixture() {
  const invoice: any = { status: "issued", currentPdfFileId: 7, publicToken: "token", lineId: "U123",
    lineSendRevision: 0,
    lineSendRetryKey: null, lineSendStartedAt: null, lineSendPdfFileId: null, lineSendTo: null,
    lineSendMessage: null, sentAt: null };
  const pdf: any = { invoiceId: 1, status: "current", storageKey: "invoice.pdf", sentAt: null };
  let inTransaction = false;
  let previousTransaction: Promise<void> = Promise.resolve();
  let failFinalization = false;
  const tx: any = {
    $queryRaw: async () => [invoice],
    $executeRaw: async (sql: TemplateStringsArray, ...values: any[]) => {
      const statement = sql.join("?");
      if (statement.includes('SET "lineSendRetryKey" = ?')) {
        Object.assign(invoice, { lineSendRetryKey: values[0], lineSendStartedAt: values[1],
          lineSendPdfFileId: values[2], lineSendTo: values[3], lineSendMessage: values[4] });
      } else if (statement.includes('SET "sentAt" = ?')) {
        assert.equal(invoice.lineSendRetryKey, values[2]);
        assert.equal(invoice.lineSendRevision, values[3]);
        Object.assign(invoice, { sentAt: values[0], lineSendStartedAt: null,
          lineSendPdfFileId: null, lineSendTo: null, lineSendMessage: null,
          lineSendRevision: invoice.lineSendRevision + 1 });
      } else {
        assert.fail(`unexpected LINE reservation update: ${statement}`);
      }
      return 1;
    },
    invoicePdfFile: {
      findUnique: async () => pdf,
      update: async ({ data }: any) => {
        if (failFinalization) throw new Error("DB write failed");
        Object.assign(pdf, data);
      },
    },
  };
  const db: any = { $transaction: async (fn: any) => {
    const previous = previousTransaction;
    let release!: () => void;
    previousTransaction = new Promise<void>(resolve => { release = resolve; });
    await previous;
    inTransaction = true;
    try { return await fn(tx); } finally { inTransaction = false; release(); }
  } };
  const input = { invoiceId: 1, pdfFileId: 7, publicToken: "token", to: "U123", message: "fixed message", accessToken: "test", operationKey: FIRST_KEY, expectedRevision: 0 };
  return { db, invoice, pdf, input, inTransaction: () => inTransaction,
    failFinalization: (value: boolean) => { failFinalization = value; } };
}

test("uncertain LINE result keeps a committed reservation; retry reuses key and accepted 409 finalizes", async () => {
  const state = fixture();
  const calls: { key: string; body: string }[] = [];
  const fetchMock = (async (_url: string, init: RequestInit) => {
    assert.equal(state.inTransaction(), false);
    const headers = init.headers as Record<string, string>;
    calls.push({ key: headers["X-Line-Retry-Key"], body: String(init.body) });
    if (calls.length === 1) return new Response("temporary", { status: 503 });
    return new Response(null, { status: 409, headers: { "x-line-accepted-request-id": "accepted-1" } });
  }) as typeof fetch;
  await assert.rejects(sendInvoiceLine(state.db, state.input, fetchMock),
    (error: any) => error.uncertain === true);
  assert.ok(state.invoice.lineSendRetryKey);
  assert.equal(state.invoice.sentAt, null);
  const sentAt = await sendInvoiceLine(state.db, { ...state.input, to: null, message: "changed", expectedRevision: 1 }, fetchMock);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
  assert.equal(state.invoice.lineSendStartedAt, null);
  assert.equal(state.invoice.sentAt, sentAt);
  assert.equal(state.invoice.lineSendRevision, 1);
  assert.equal(state.pdf.sentAt, sentAt);
});

test("accepted LINE response with DB finalization failure retains the key for accepted replay", async () => {
  const state = fixture();
  state.failFinalization(true);
  const keys: string[] = [];
  const fetchMock = (async (_url: string, init: RequestInit) => {
    keys.push((init.headers as Record<string, string>)["X-Line-Retry-Key"]);
    return keys.length === 1 ? new Response(null, { status: 200 })
      : new Response(null, { status: 409, headers: { "x-line-accepted-request-id": "accepted-2" } });
  }) as typeof fetch;
  await assert.rejects(sendInvoiceLine(state.db, state.input, fetchMock),
    (error: any) => error.uncertain === true);
  assert.equal(state.invoice.lineSendRetryKey, keys[0]);
  state.failFinalization(false);
  await sendInvoiceLine(state.db, state.input, fetchMock);
  assert.equal(keys[0], keys[1]);
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
  assert.equal(state.invoice.lineSendRevision, 1);
});

test("network uncertainty and nonaccepted 4xx retain the same reservation", async () => {
  const state = fixture();
  await assert.rejects(sendInvoiceLine(state.db, state.input, (async () => { throw new Error("timeout"); }) as typeof fetch),
    (error: any) => error.uncertain === true);
  await assert.rejects(sendInvoiceLine(state.db, state.input, (async () => new Response(null, { status: 409 })) as typeof fetch),
    (error: any) => error.uncertain === true);
  await assert.rejects(sendInvoiceLine(state.db, state.input,
    (async () => new Response(null, { status: 400 })) as typeof fetch), (error: any) => error.uncertain === true);
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
  assert.equal(state.invoice.lineSendRevision, 0);
  assert.ok(state.invoice.lineSendStartedAt);
});

test("concurrent same-key 4xx cannot clear a reservation accepted by another call", async () => {
  const state = fixture();
  let releaseAccepted!: () => void;
  let acceptedProviderEntered!: () => void;
  const acceptedGate = new Promise<void>(resolve => { releaseAccepted = resolve; });
  const acceptedEntered = new Promise<void>(resolve => { acceptedProviderEntered = resolve; });
  const keys: string[] = [];
  const provider = (async (_url: string, init: RequestInit) => {
    keys.push((init.headers as Record<string, string>)["X-Line-Retry-Key"]);
    if (keys.length === 1) {
      acceptedProviderEntered();
      await acceptedGate;
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 400 });
  }) as typeof fetch;
  const acceptedSend = sendInvoiceLine(state.db, state.input, provider);
  await acceptedEntered;
  await assert.rejects(sendInvoiceLine(state.db, state.input, provider),
    (error: any) => error.uncertain === true);
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
  assert.ok(state.invoice.lineSendStartedAt);
  assert.equal(state.invoice.sentAt, null);
  releaseAccepted();
  const sentAt = await acceptedSend;
  assert.deepEqual(keys, [FIRST_KEY, FIRST_KEY]);
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
  assert.equal(state.invoice.lineSendStartedAt, null);
  assert.equal(state.invoice.sentAt, sentAt);
  assert.equal(state.pdf.sentAt, sentAt);
});

test("a pending LINE retry key at 23 hours fails closed without provider call", async () => {
  const state = fixture();
  state.invoice.lineSendRetryKey = FIRST_KEY;
  state.invoice.lineSendStartedAt = new Date(Date.now() - 23 * 60 * 60 * 1000 - 1000);
  state.invoice.lineSendPdfFileId = 7;
  state.invoice.lineSendTo = "U123";
  state.invoice.lineSendMessage = "fixed message";
  let calls = 0;
  await assert.rejects(sendInvoiceLine(state.db, state.input, (async () => {
    calls += 1; return new Response(null, { status: 200 });
  }) as typeof fetch), (error: any) => error.manualVerificationRequired === true && error.status === 409);
  assert.equal(calls, 0);
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
});

test("two concurrent accepted responses finalize the same reservation once", async () => {
  const state = fixture();
  let releaseProvider!: () => void;
  let firstProviderEntered!: () => void;
  let arrivals = 0;
  const bothAtProvider = new Promise<void>(resolve => { releaseProvider = resolve; });
  const atProvider = new Promise<void>(resolve => { firstProviderEntered = resolve; });
  const fetchMock = (async () => {
    arrivals += 1;
    if (arrivals === 1) firstProviderEntered();
    if (arrivals === 2) releaseProvider();
    await bothAtProvider;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const firstSend = sendInvoiceLine(state.db, state.input, fetchMock);
  await atProvider;
  const secondSend = sendInvoiceLine(state.db, state.input, fetchMock);
  const [first, second] = await Promise.all([firstSend, secondSend]);
  assert.equal(first.getTime(), second.getTime());
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
  assert.equal(state.invoice.lineSendRevision, 1);
});

test("completed send replays the same operation and original sentAt without another provider call", async () => {
  const state = fixture();
  let calls = 0;
  const provider = (async (_url: string, init: RequestInit) => {
    calls += 1;
    assert.equal((init.headers as Record<string, string>)["X-Line-Retry-Key"], FIRST_KEY);
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const first = await sendInvoiceLine(state.db, state.input, provider);
  // Equivalent to provider + DB success followed by a lost HTTP response and browser retry.
  const replay = await sendInvoiceLine(state.db, { ...state.input, expectedRevision: 99 }, provider);
  assert.equal(replay, first);
  assert.equal(calls, 1);
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
  assert.equal(state.invoice.lineSendStartedAt, null);
  assert.equal(state.invoice.lineSendRevision, 1);
});

test("a different operation after completed success intentionally sends again with freshly loaded revision", async () => {
  const state = fixture();
  const keys: string[] = [];
  const provider = (async (_url: string, init: RequestInit) => {
    keys.push((init.headers as Record<string, string>)["X-Line-Retry-Key"]);
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  await sendInvoiceLine(state.db, state.input, provider);
  const second = await sendInvoiceLine(state.db, { ...state.input, operationKey: SECOND_KEY,
    expectedRevision: state.invoice.lineSendRevision }, provider);
  assert.deepEqual(keys, [FIRST_KEY, SECOND_KEY]);
  assert.equal(state.invoice.lineSendRetryKey, SECOND_KEY);
  assert.equal(state.invoice.sentAt, second);
  assert.equal(state.invoice.lineSendRevision, 2);
});

test("lost-response A cannot be sent again after intentional B, even after retry-key retention", async () => {
  const state = fixture();
  const keys: string[] = [];
  const provider = (async (_url: string, init: RequestInit) => {
    keys.push((init.headers as Record<string, string>)["X-Line-Retry-Key"]);
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  await sendInvoiceLine(state.db, state.input, provider);
  await sendInvoiceLine(state.db, { ...state.input, operationKey: SECOND_KEY, expectedRevision: 1 }, provider);
  const originalNow = Date.now;
  Date.now = () => originalNow() + 25 * 60 * 60 * 1000;
  try {
    await assert.rejects(sendInvoiceLine(state.db, state.input, provider),
      (error: any) => error.status === 409 && error.staleRevision === true && error.uncertain === false);
  } finally { Date.now = originalNow; }
  assert.deepEqual(keys, [FIRST_KEY, SECOND_KEY]);
  assert.equal(state.invoice.lineSendRevision, 2);
});

test("stale cross-tab revision cannot start a different operation", async () => {
  const state = fixture();
  let calls = 0;
  const provider = (async () => { calls += 1; return new Response(null, { status: 200 }); }) as typeof fetch;
  await sendInvoiceLine(state.db, state.input, provider);
  await assert.rejects(sendInvoiceLine(state.db, { ...state.input, operationKey: SECOND_KEY }, provider),
    (error: any) => error.status === 409 && error.staleRevision === true);
  assert.equal(calls, 1);
});

test("a different operation cannot take over a pending reservation", async () => {
  const state = fixture();
  let calls = 0;
  await assert.rejects(sendInvoiceLine(state.db, state.input, (async () => {
    calls += 1; return new Response(null, { status: 503 });
  }) as typeof fetch), (error: any) => error.uncertain === true);
  await assert.rejects(sendInvoiceLine(state.db, { ...state.input, operationKey: SECOND_KEY },
    (async () => { calls += 1; return new Response(null, { status: 200 }); }) as typeof fetch),
  (error: any) => error.status === 409 && error.uncertain === false);
  assert.equal(calls, 1);
  assert.equal(state.invoice.lineSendRetryKey, FIRST_KEY);
});
