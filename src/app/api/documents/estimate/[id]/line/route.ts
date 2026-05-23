import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const WAITING_FOR_APPROVAL_STATUS = "承認待ち";
const APPROVAL_SOURCE_STATUSES = new Set(["受付", "見積中"]);

export const runtime = "nodejs";

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

type CurrentPdfFileRow = {
  currentPdfFileId: number | null;
  storageKey: string | null;
  status: string | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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

  const [currentPdfFile] = await prisma.$queryRaw<CurrentPdfFileRow[]>`
    SELECT
      d."currentPdfFileId",
      f."storageKey",
      f."status"
    FROM "EstimateDocument" d
    LEFT JOIN "EstimatePdfFile" f ON f."id" = d."currentPdfFileId"
    WHERE d."id" = ${estimateDocument.id}
    LIMIT 1
  `;

  if (!currentPdfFile?.currentPdfFileId || !currentPdfFile.storageKey) {
    return NextResponse.json(
      { ok: false, success: false, error: "PDF not generated" },
      { status: 400 }
    );
  }

  const publicToken = await ensureEstimateDocumentPublicToken(estimateDocument.id);
  await Promise.all(estimateDocument.repairs.map((repair) => ensureRepairPublicToken(repair.id)));
  const estimateUrl = new URL(`/customer/repairs/${publicToken}`, request.url).toString();

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
          text: `お見積りを共有いたします。\n\n下記URLより、対象案件・お見積内容をご確認ください。\n${estimateUrl}\n\nご確認後、画面上の「承認」または「差戻し」よりご回答ください。`,
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
    updatedRepairCount: targetRepairs.length,
  });
}
