import { NextRequest } from "next/server";
import path from "path";
import { Readable } from "stream";

import { prisma } from "@/lib/prisma";
import { formatPartDisplay } from "@/lib/formatPartDisplay";
import {
  createEstimateServerDocumentElement,
  EstimateServerDocumentProps,
} from "@/components/pdf/EstimateServerDocument";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const repairInclude = {
  customer: true,
  watch: { include: { brand: true, model: true, reference: true } },
  estimate: {
    include: {
      items: {
        include: {
          partsMaster: { select: { grade: true, notes2: true } },
        },
      },
    },
  },
  estimateDocument: { select: { id: true, estimateNumber: true, issuedDate: true } },
};

function getJobs(repairs: any[]) {
  return repairs.map((repair) => {
    const estimateItems = repair.estimate?.items || [];
    return {
      id: String(repair.id),
      inquiryNumber: repair.inquiryNumber,
      partnerRef: repair.partnerRef || undefined,
      endUserName: repair.endUserName || undefined,
      customerNote: repair.customerNote || "",
      watch: {
        brand: repair.watch?.brand?.name || "",
        model: repair.watch?.model?.name || "",
        ref: repair.watch?.reference?.name || undefined,
        serial: repair.watch?.serialNumber || undefined,
      },
      items: estimateItems.map((item: any) => ({
        name: item.itemName,
        price: item.unitPrice,
        type: item.type,
        grade: item.partsMaster?.grade ?? undefined,
        note2: item.partsMaster?.notes2 ?? undefined,
        displayName:
          item.type === "part"
            ? formatPartDisplay({
                name: item.itemName,
                grade: item.partsMaster?.grade,
                note2: item.partsMaster?.notes2,
              })
            : item.itemName,
      })),
    };
  });
}

async function renderEstimatePdf(data: EstimateServerDocumentProps["data"]) {
  const nodeRequire = eval("require") as NodeRequire;
  const ReactRuntime = nodeRequire("react");
  const renderer = nodeRequire("@react-pdf/renderer");
  const { Font, renderToStream } = renderer;

  Font.register({
    family: "Noto Sans JP",
    src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf"),
  });

  const documentElement = createEstimateServerDocumentElement(ReactRuntime, renderer, data);
  return renderToStream(documentElement) as Promise<NodeJS.ReadableStream>;
}

function pdfFileName(estimateNumber: string) {
  return `estimate_${estimateNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
}

function getPdfCustomerName(customer: { type: string; name: string; companyName: string | null }) {
  if (customer.type === "business") {
    return customer.companyName?.trim() || customer.name?.trim() || "";
  }
  return customer.name?.trim() || "";
}

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token?.trim();
  if (!token) {
    return new Response("Not found", { status: 404 });
  }

  const estimateDocument = await prisma.estimateDocument.findFirst({
    where: { publicToken: token },
    include: {
      customer: true,
      repairs: {
        orderBy: { id: "asc" },
        include: repairInclude,
      },
    },
  });

  let pdfData: EstimateServerDocumentProps["data"] | null = null;

  if (estimateDocument) {
    const primaryRepair = estimateDocument.repairs[0];
    if (!primaryRepair) {
      return new Response("Not found", { status: 404 });
    }

    pdfData = {
      estimateNumber: estimateDocument.estimateNumber,
      date: estimateDocument.issuedDate.toLocaleDateString("ja-JP"),
      customer: {
        name: getPdfCustomerName(estimateDocument.customer),
        type: estimateDocument.customer.type,
        address: estimateDocument.customer.address || undefined,
      },
      jobs: getJobs(estimateDocument.repairs),
    };
  } else {
    const repair = await prisma.repair.findFirst({
      where: { publicToken: token },
      include: repairInclude,
    });

    if (!repair?.estimateDocument) {
      return new Response("Not found", { status: 404 });
    }

    pdfData = {
      estimateNumber: repair.estimateDocument.estimateNumber,
      date: repair.estimateDocument.issuedDate.toLocaleDateString("ja-JP"),
      customer: {
        name: getPdfCustomerName(repair.customer),
        type: repair.customer.type,
        address: repair.customer.address || undefined,
      },
      jobs: getJobs([repair]),
    };
  }

  const nodeStream = await renderEstimatePdf(pdfData);
  const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(pdfData.estimateNumber)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
