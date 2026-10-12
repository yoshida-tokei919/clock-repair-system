import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createDeliveryPrintServer, DELIVERY_PRINTER, printFixedDeliveryNote } from "./delivery-note-print-helper-core";

if (process.platform !== "win32") throw new Error("This print helper requires Windows");
const origin = process.env.DELIVERY_PRINT_ALLOWED_ORIGIN;
if (!origin) throw new Error("Set DELIVERY_PRINT_ALLOWED_ORIGIN to the application origin");

const server = createDeliveryPrintServer(origin, async (pdf) => {
  const path = join(tmpdir(), `delivery-note-${randomUUID()}.pdf`);
  try {
    await writeFile(path, pdf, { flag: "wx" });
    const module = await import("pdf-to-printer");
    await printFixedDeliveryNote(path, module);
  } finally {
    await unlink(path).catch(() => undefined);
  }
});
server.listen(5750, "127.0.0.1", () => {
  console.log(`Delivery note print helper listening on 127.0.0.1:5750; printer=${DELIVERY_PRINTER}`);
});
