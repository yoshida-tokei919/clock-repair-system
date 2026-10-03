import * as renderer from "@react-pdf/renderer";
import ReactRuntime from "react";
import path from "path";

import {
  createEstimateServerDocumentElement,
  type EstimateServerDocumentProps,
} from "@/components/pdf/EstimateServerDocument";

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function renderEstimatePdfBuffer(data: EstimateServerDocumentProps["data"]) {
  const { Font, renderToStream } = renderer;

  Font.register({
    family: "Estimate Server Noto Sans JP",
    src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf"),
  });

  const documentElement = createEstimateServerDocumentElement(ReactRuntime, renderer, data);
  const stream = (await renderToStream(documentElement)) as NodeJS.ReadableStream;
  return streamToBuffer(stream);
}
