import assert from "node:assert/strict";
import { test } from "node:test";

// The stream reader is pure; stub server-only imports when loading its module in Node.
const loader = require("node:module") as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;
let readLineImageStream: (stream: ReadableStream<Uint8Array>) => Promise<Buffer>;
try {
  loader._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "sharp") return { default: () => { throw new Error("unused"); } };
    if (request === "@/lib/r2-inquiry-files") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  ({ readLineImageStream } = require("./line-inquiry-image"));
} finally {
  loader._load = originalLoad;
}

const MAX = 20 * 1024 * 1024;

test("accepts a stream of exactly 20 MiB", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX / 2));
      controller.enqueue(new Uint8Array(MAX / 2));
      controller.close();
    },
  });
  const body = await readLineImageStream(stream);
  assert.equal(body.length, MAX);
});

test("cancels a stream as soon as it exceeds 20 MiB", async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { canceled = true; },
  });
  await assert.rejects(readLineImageStream(stream), /exceeds the allowed size/);
  assert.equal(canceled, true);
});

test("rejects an empty stream", async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
  await assert.rejects(readLineImageStream(stream), /empty/);
});
