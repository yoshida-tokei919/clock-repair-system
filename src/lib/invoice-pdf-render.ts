import * as renderer from "@react-pdf/renderer";
import path from "node:path";

import {
  createInvoiceDocumentElement,
  type InvoiceDocumentProps,
} from "@/components/pdf/InvoiceDocument";

const serverFontFamily = "Invoice Server Noto Sans JP";

export async function renderInvoicePdfBuffer(data: InvoiceDocumentProps["data"]): Promise<Buffer> {
  renderer.Font.register({
    family: serverFontFamily,
    src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf"),
  });

  const documentElement = createInvoiceDocumentElement(renderer, data, serverFontFamily);
  const stream = await renderer.renderToStream(
    documentElement as Parameters<typeof renderer.renderToStream>[0],
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
