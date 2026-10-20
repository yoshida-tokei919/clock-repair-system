import assert from "node:assert/strict";
import test from "node:test";
import { nextB2cInquiryNumber } from "./b2c-inquiry-number";

function numberingTx(existing: string[], currentSeq = 9999) {
  const calls: string[] = [];
  let updated: unknown;
  const tx = {
    $queryRaw: async () => { calls.push("customer-lock"); return [{ id: 12 }]; },
    $executeRaw: async () => { calls.push("shared-lock"); return 1; },
    repair: { findMany: async () => { calls.push("scan"); return existing.map((inquiryNumber) => ({ inquiryNumber })); } },
    customer: { currentSeq, update: async (args: unknown) => { calls.push("update"); updated = args; } },
  };
  return { tx, calls, get updated() { return updated; } };
}

test("B2C starts at C-1001 and ignores unrelated Customer.currentSeq", async () => {
  const fixture = numberingTx(["C-001", "C-bad", "C-1000x"], 9999);
  assert.equal(await nextB2cInquiryNumber(fixture.tx as never, 12), "C-1001");
  assert.deepEqual(fixture.calls, ["customer-lock", "shared-lock", "scan", "update"]);
  assert.deepEqual(fixture.updated, { where: { id: 12 }, data: { currentSeq: 1001, prefix: "C" } });
});

test("B2C continues after C-1001 and an existing C-10000", async () => {
  assert.equal(await nextB2cInquiryNumber(numberingTx(["C-001", "C-1001"]).tx as never, 12), "C-1002");
  assert.equal(await nextB2cInquiryNumber(numberingTx(["C-10000", "C-9999"]).tx as never, 12), "C-10001");
});

test("two repairs in one transaction see the previous issued number", async () => {
  const existing = ["C-001"];
  const fixture = numberingTx(existing);
  const first = await nextB2cInquiryNumber(fixture.tx as never, 12);
  existing.push(first);
  const second = await nextB2cInquiryNumber(fixture.tx as never, 12);
  assert.deepEqual([first, second], ["C-1001", "C-1002"]);
});

test("concurrent issuers for different customers scan after the shared lock", async () => {
  const existing = ["C-001"];
  let previous = Promise.resolve();

  async function issue(customerId: number) {
    let release!: () => void;
    const tx = {
      $queryRaw: async () => [{ id: customerId }],
      $executeRaw: async () => {
        const waitForPrevious = previous;
        previous = new Promise<void>((resolve) => { release = resolve; });
        await waitForPrevious;
      },
      repair: { findMany: async () => existing.map((inquiryNumber) => ({ inquiryNumber })) },
      customer: { update: async () => undefined },
    };
    const number = await nextB2cInquiryNumber(tx as never, customerId);
    existing.push(number); // Simulated commit before releasing the transaction lock.
    release();
    return number;
  }

  assert.deepEqual(await Promise.all([issue(12), issue(13)]), ["C-1001", "C-1002"]);
});
