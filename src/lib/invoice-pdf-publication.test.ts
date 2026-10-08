import assert from "node:assert/strict";
import test from "node:test";
import { publishInvoicePdf } from "./invoice-pdf-publication";

const input = { invoiceId: 1, pdfFileId: 7, storageKey: "invoices/1/7.pdf", hash: "expected-hash", fileSize: 123 };

function fixture(options: { publicationError?: "committed" | "rolled-back"; status?: string; lineSendStartedAt?: Date | null;
  readError?: boolean; inconsistent?: boolean } = {}) {
  const invoice = { status: options.status ?? "issued", lineSendStartedAt: options.lineSendStartedAt ?? null,
    currentPdfFileId: 3 as number | null };
  const file = { invoiceId: 1, status: "draft", storageKey: "", hash: null as string | null,
    fileSize: null as number | null };
  const previous = { status: "current" };
  const deleted: string[] = [];
  let publicationCalls = 0;
  let voidUpdates = 0;
  const db: any = {
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      publicationCalls++;
      const publishing = publicationCalls === 1;
      const tx = {
        $queryRaw: async (strings: TemplateStringsArray) => {
          const sql = strings.join("?");
          if (!publishing && options.readError) throw new Error("read unavailable");
          if (sql.includes('"currentPdfFileId" FROM "Invoice"')) return [invoice];
          if (sql.includes('FROM "InvoicePdfFile"')) return [file];
          return [invoice];
        },
        $executeRaw: async (strings: TemplateStringsArray) => {
          const sql = strings.join("?");
          if (sql.includes("'superseded'")) previous.status = "superseded";
          else if (sql.includes("'current'")) Object.assign(file, { status: "current", storageKey: input.storageKey,
            hash: input.hash, fileSize: input.fileSize });
          else if (sql.includes('SET "currentPdfFileId"')) invoice.currentPdfFileId = input.pdfFileId;
          else if (sql.includes("'void'")) {
            assert.equal(file.status, "draft");
            assert.notEqual(invoice.currentPdfFileId, input.pdfFileId);
            file.status = "void";
            voidUpdates++;
          } else assert.fail(`unexpected SQL: ${sql}`);
          return 1;
        },
      };
      if (publishing) {
        const original = { invoice: { ...invoice }, file: { ...file }, previous: { ...previous } };
        try {
          const result = await callback(tx);
          if (options.publicationError === "committed") {
            if (options.inconsistent) file.hash = "different";
            throw new Error("commit acknowledgment lost");
          }
          if (options.publicationError === "rolled-back") throw new Error("transaction rolled back");
          return result;
        } catch (error) {
          if (options.publicationError !== "committed") {
            Object.assign(invoice, original.invoice);
            Object.assign(file, original.file);
            Object.assign(previous, original.previous);
          }
          throw error;
        }
      }
      return callback(tx);
    },
  };
  const run = () => publishInvoicePdf(db, input, async key => { deleted.push(key); });
  return { run, invoice, file, previous, deleted, voidUpdates: () => voidUpdates,
    transactions: () => publicationCalls };
}

test("lost commit acknowledgment with matching published read-back returns success without cleanup", async () => {
  const state = fixture({ publicationError: "committed" });
  assert.equal(await state.run(), "published");
  assert.equal(state.invoice.currentPdfFileId, input.pdfFileId);
  assert.equal(state.file.status, "current");
  assert.deepEqual(state.deleted, []);
  assert.equal(state.voidUpdates(), 0);
  assert.equal(state.transactions(), 2);
});

test("proved rollback voids only the draft and removes its upload", async () => {
  const state = fixture({ publicationError: "rolled-back" });
  assert.equal(await state.run(), "failed");
  assert.equal(state.invoice.currentPdfFileId, 3);
  assert.equal(state.previous.status, "current");
  assert.equal(state.file.status, "void");
  assert.equal(state.voidUpdates(), 1);
  assert.deepEqual(state.deleted, [input.storageKey]);
});

test("inconsistent published metadata or failed read-back leaves the artifact untouched", async () => {
  for (const options of [{ publicationError: "committed", inconsistent: true },
    { publicationError: "rolled-back", readError: true }] as const) {
    const state = fixture(options);
    assert.equal(await state.run(), "uncertain");
    assert.deepEqual(state.deleted, []);
    assert.equal(state.voidUpdates(), 0);
  }
});

test("ordinary successful publication retains the success path", async () => {
  const state = fixture();
  assert.equal(await state.run(), "published");
  assert.equal(state.transactions(), 1);
  assert.equal(state.invoice.currentPdfFileId, input.pdfFileId);
  assert.equal(state.file.status, "current");
  assert.equal(state.previous.status, "superseded");
  assert.deepEqual(state.deleted, []);
});

test("concurrent void and unresolved LINE reservation block publication and preserve old PDF", async () => {
  for (const options of [{ status: "void" }, { lineSendStartedAt: new Date() }]) {
    const state = fixture(options);
    assert.equal(await state.run(), "failed");
    assert.equal(state.invoice.currentPdfFileId, 3);
    assert.equal(state.previous.status, "current");
    assert.equal(state.file.status, "void");
    assert.deepEqual(state.deleted, [input.storageKey]);
  }
});
