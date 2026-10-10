import assert from "node:assert/strict";
import test from "node:test";
import { resolvePdfPrint } from "./yupuri-cloud-print";

test("pdf-to-printer resolves Windows CJS default and direct ESM print exports", async () => {
  const calls: string[] = [];
  const print = async (path: string, options: { printer: string }) => { calls.push(`${path}:${options.printer}`); };
  await resolvePdfPrint({ default: { print } })("sample.pdf", { printer: "test" });
  await resolvePdfPrint({ print })("other.pdf", { printer: "test" });
  assert.deepEqual(calls, ["sample.pdf:test", "other.pdf:test"]);
  for (const shape of [{}, { print: null }, { default: {} }, null]) {
    assert.throws(() => resolvePdfPrint(shape), /print export unavailable/);
  }
});
