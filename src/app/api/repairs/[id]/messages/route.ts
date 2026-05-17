import crypto from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

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

async function sendStaffReplyNotification(input: {
  lineId: string;
  sharedUrl: string;
}) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return { sent: false, reason: "missing_token" as const };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.lineId,
      messages: [
        {
          type: "text",
          text: `お見積について返信があります。\n\n以下のページよりご確認ください。\n${input.sharedUrl}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("LINE staff reply notification failed", {
      status: response.status,
      body,
    });
    return { sent: false, reason: "line_error" as const };
  }

  return { sent: true, reason: null };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repairId = Number(params.id);
  if (!Number.isInteger(repairId)) {
    return NextResponse.json({ error: "修理IDが不正です。" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const messageBody = typeof body?.body === "string" ? body.body.trim() : "";

  if (!messageBody) {
    return NextResponse.json({ error: "返信内容を入力してください。" }, { status: 400 });
  }

  const repair = await prisma.repair.findUnique({
    where: { id: repairId },
    select: {
      id: true,
      customer: { select: { lineId: true } },
    },
  });

  if (!repair) {
    return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  }

  const [message] = await prisma.$queryRaw<
    { id: number; body: string; createdAt: Date }[]
  >`
    INSERT INTO "RepairCustomerMessage" ("repairId", "body", "readAt")
    VALUES (${repairId}, ${messageBody}, NOW())
    RETURNING "id", "body", "createdAt"
  `;

  const publicToken = await ensureRepairPublicToken(repairId);
  const sharedUrl = new URL(`/customer/repairs/${publicToken}`, request.url).toString();
  const lineId = repair.customer.lineId?.trim();
  const notification = lineId
    ? await sendStaffReplyNotification({ lineId, sharedUrl })
    : { sent: false, reason: "missing_line_id" as const };

  return NextResponse.json({
    success: true,
    message,
    notification,
    sharedUrl,
  });
}
