import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolvePdfPrint } from "./yupuri-cloud-print";

export const DELIVERY_PRINTER = "NEC MultiWriter 5750C";
const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function printFixedDeliveryNote(path: string, printerModule: unknown) {
  await resolvePdfPrint(printerModule)(path, { printer: DELIVERY_PRINTER });
}

export function createDeliveryPrintServer(allowedOrigin: string, printPdf: (pdf: Buffer) => Promise<void>) {
  if (!/^https:\/\/[^/]+$/.test(allowedOrigin) && !/^http:\/\/localhost(?::\d+)?$/.test(allowedOrigin)) {
    throw new Error("DELIVERY_PRINT_ALLOWED_ORIGIN must be one exact HTTPS origin (or localhost for development)");
  }
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const origin = request.headers.origin;
    if (origin !== allowedOrigin) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "OPTIONS" && request.url === "/print") {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== "POST" || request.url !== "/print") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers["content-type"] !== "application/pdf") {
      response.writeHead(415).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_PDF_BYTES) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const pdf = Buffer.concat(chunks);
      if (pdf.length < 5 || pdf.toString("ascii", 0, 5) !== "%PDF-") {
        response.writeHead(422).end();
        return;
      }
      await printPdf(pdf);
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ printer: DELIVERY_PRINTER, submitted: true }));
    } catch {
      response.writeHead(500).end();
    }
  });
}
