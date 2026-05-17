import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import { prisma } from "@/lib/prisma";
import {
  createEstimateServerDocumentElement,
  EstimateServerDocumentProps,
} from "@/components/pdf/EstimateServerDocument";
import { formatPartDisplay } from "@/lib/formatPartDisplay";

const WAITING_FOR_APPROVAL_STATUS = "承認待ち";
const APPROVAL_SOURCE_STATUSES = new Set(["受付", "見積中"]);
const ESTIMATE_SAVE_DIR = "C:\\Users\\yoshi\\Google ドライブ\\ファイルメーカー\\見積書";
const WINDOWS_FORBIDDEN_FILE_CHARS = /[<>:"/\\|?*]/g;

export const runtime = "nodejs";

function formatDateForFileName(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function sanitizeFileNamePart(value: string) {
  const sanitized = value.replace(WINDOWS_FORBIDDEN_FILE_CHARS, "").trim();
  return sanitized || "お客様";
}

function getCustomerDisplayName(customer: {
  type: string;
  name: string;
  companyName: string | null;
}) {
  if (customer.type === "business") {
    return customer.companyName?.trim() || customer.name?.trim() || "お客様";
  }

  return customer.name?.trim() || customer.companyName?.trim() || "お客様";
}

function getUniqueFilePath(directory: string, baseName: string) {
  let candidate = path.join(directory, `${baseName}.pdf`);
  let index = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName}-${index}.pdf`);
    index += 1;
  }

  return candidate;
}

async function writeStreamToFile(stream: NodeJS.ReadableStream, filePath: string) {
  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(filePath);
    stream.pipe(fileStream);
    stream.on("error", reject);
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });
}

async function saveEstimatePdf(data: EstimateServerDocumentProps["data"], filePath: string) {
  const nodeRequire = eval("require") as NodeRequire;
  const ReactRuntime = nodeRequire("react");
  const renderer = nodeRequire("@react-pdf/renderer");
  const { Font, renderToStream } = renderer;

  Font.register({
    family: "Noto Sans JP",
    src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf"),
  });

  const documentElement = createEstimateServerDocumentElement(ReactRuntime, renderer, data);
  const stream = await renderToStream(documentElement);
  await writeStreamToFile(stream, filePath);
}

async function ensureRepairPublicToken(repairId: number) {
  const [existing] = await prisma.$queryRaw<{ publicToken: string | null }[]>`
    SELECT "publicToken"
    FROM "Repair"
    WHERE "id" = ${repairId}
  `;

  if (existing?.publicToken) {
    return existing.publicToken;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString("base64url");
    const updated = await prisma.$executeRaw`
      UPDATE "Repair"
      SET "publicToken" = ${token},
          "publicTokenCreatedAt" = NOW()
      WHERE "id" = ${repairId}
        AND "publicToken" IS NULL
    `;

    if (updated === 1) {
      return token;
    }

    const [current] = await prisma.$queryRaw<{ publicToken: string | null }[]>`
      SELECT "publicToken"
      FROM "Repair"
      WHERE "id" = ${repairId}
    `;

    if (current?.publicToken) {
      return current.publicToken;
    }
  }

  throw new Error("Failed to create repair public token");
}

async function ensureEstimateDocumentPublicToken(documentId: number) {
  const [existing] = await prisma.$queryRaw<{ publicToken: string | null }[]>`
    SELECT "publicToken"
    FROM "EstimateDocument"
    WHERE "id" = ${documentId}
  `;

  if (existing?.publicToken) {
    return existing.publicToken;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString("base64url");
    const updated = await prisma.$executeRaw`
      UPDATE "EstimateDocument"
      SET "publicToken" = ${token},
          "publicTokenCreatedAt" = NOW()
      WHERE "id" = ${documentId}
        AND "publicToken" IS NULL
    `;

    if (updated === 1) {
      return token;
    }

    const [current] = await prisma.$queryRaw<{ publicToken: string | null }[]>`
      SELECT "publicToken"
      FROM "EstimateDocument"
      WHERE "id" = ${documentId}
    `;

    if (current?.publicToken) {
      return current.publicToken;
    }
  }

  throw new Error("Failed to create estimate document public token");
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const documentId = Number(params.id);

  if (!Number.isInteger(documentId)) {
    return NextResponse.json(
      { success: false, error: "見積書IDが不正です。" },
      { status: 400 }
    );
  }

  const estimateDocument = await prisma.estimateDocument.findUnique({
    where: { id: documentId },
    include: {
      customer: true,
      repairs: {
        include: {
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
        },
      },
    },
  });

  if (!estimateDocument) {
    return NextResponse.json(
      { success: false, error: "見積書が見つかりません。" },
      { status: 404 }
    );
  }

  const lineUserId = estimateDocument.customer.lineId?.trim();
  if (!lineUserId) {
    return NextResponse.json(
      { success: false, error: "顧客のLINE userIdが未登録です。" },
      { status: 400 }
    );
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "LINE_CHANNEL_ACCESS_TOKENが設定されていません。" },
      { status: 500 }
    );
  }

  const primaryRepair = estimateDocument.repairs[0];
  if (!primaryRepair) {
    return NextResponse.json(
      { success: false, error: "見積書に修理案件が紐づいていません。" },
      { status: 400 }
    );
  }

  const publicToken = await ensureEstimateDocumentPublicToken(estimateDocument.id);
  await Promise.all(estimateDocument.repairs.map((repair) => ensureRepairPublicToken(repair.id)));
  const estimateUrl = new URL(`/customer/repairs/${publicToken}`, request.url).toString();
  const jobs = estimateDocument.repairs.map((repair) => {
    const estimateItems = repair.estimate?.items || [];
    return {
      id: String(repair.id),
      inquiryNumber: repair.inquiryNumber,
      partnerRef: repair.partnerRef || undefined,
      endUserName: repair.endUserName || undefined,
      customerNote: repair.customerNote || "",
      watch: {
        brand: repair.watch.brand?.name || "",
        model: repair.watch.model?.name || "",
        ref: repair.watch.reference?.name || undefined,
        serial: repair.watch.serialNumber || undefined,
      },
      items: estimateItems.map((item) => ({
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
  const pdfData: EstimateServerDocumentProps["data"] = {
    estimateNumber: estimateDocument.estimateNumber,
    date: estimateDocument.issuedDate.toLocaleDateString("ja-JP"),
    customer: {
      name: estimateDocument.customer.type === "business" ? primaryRepair.endUserName?.trim() || "" : "",
      address: estimateDocument.customer.address || undefined,
    },
    jobs,
  };
  const customerName = sanitizeFileNamePart(getCustomerDisplayName(estimateDocument.customer));
  const issuedDate = formatDateForFileName(estimateDocument.issuedDate);
  const fileBaseName = `${customerName}様見積書${issuedDate}`;
  fs.mkdirSync(ESTIMATE_SAVE_DIR, { recursive: true });
  const savedFilePath = getUniqueFilePath(ESTIMATE_SAVE_DIR, fileBaseName);
  try {
    await saveEstimatePdf(pdfData, savedFilePath);
  } catch (error) {
    console.error("Estimate PDF save failed", { documentId, savedFilePath, error });
    return NextResponse.json(
      { success: false, error: "見積書PDFの保存に失敗しました。" },
      { status: 500 }
    );
  }

  const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [
        {
          type: "text",
          text: `お見積書をお送りします。\n${estimateUrl}`,
        },
      ],
    }),
  });

  if (!lineResponse.ok) {
    const lineError = await lineResponse.text();
    console.error("LINE estimate send failed", {
      documentId,
      status: lineResponse.status,
      body: lineError,
    });

    return NextResponse.json(
      { success: false, error: "LINE送信に失敗しました。" },
      { status: 502 }
    );
  }

  const sentAt = new Date();
  const targetRepairs = estimateDocument.repairs.filter((repair) =>
    APPROVAL_SOURCE_STATUSES.has(repair.status)
  );

  await prisma.$transaction(async (tx) => {
    for (const repair of targetRepairs) {
      await tx.repair.update({
        where: { id: repair.id },
        data: { status: WAITING_FOR_APPROVAL_STATUS },
      });

      const existingLog = await tx.repairStatusLog.findFirst({
        where: {
          repairId: repair.id,
          status: WAITING_FOR_APPROVAL_STATUS,
        },
        select: { id: true },
      });

      if (!existingLog) {
        await tx.repairStatusLog.create({
          data: {
            repairId: repair.id,
            status: WAITING_FOR_APPROVAL_STATUS,
            changedAt: sentAt,
          },
        });
      }
    }
  });

  return NextResponse.json({
    success: true,
    savedFilePath,
    updatedRepairCount: targetRepairs.length,
  });
}
