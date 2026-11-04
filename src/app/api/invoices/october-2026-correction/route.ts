import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { activateOctoberCorrection, OctoberCorrectionError, preparePdfBytes, previewOctoberCorrection, stageOctoberCorrection } from "@/lib/issued-october-invoice-correction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json(await previewOctoberCorrection(prisma)); }
  catch (error) {
    if (error instanceof OctoberCorrectionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("October invoice correction preview failed", error);
    return NextResponse.json({ error: "訂正対象を確認できません" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "入力が不正です" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (input.confirm !== true || typeof input.fingerprint !== "string") return NextResponse.json({ error: "確認値と明示確認が必要です" }, { status: 400 });
  try {
    if (input.action === "stage" && Object.keys(input).sort().join(",") === "action,confirm,fingerprint") {
      return NextResponse.json(await stageOctoberCorrection(prisma, input.fingerprint), { status: 201 });
    }
    if (input.action === "resume" && Number.isSafeInteger(input.batchId) && Object.keys(input).sort().join(",") === "action,batchId,confirm,fingerprint") {
      const preview = await previewOctoberCorrection(prisma);
      if (preview.fingerprint !== input.fingerprint || preview.batch?.id !== input.batchId || preview.batch?.status !== "preparing") throw new OctoberCorrectionError("訂正準備の状態が変わりました");
      await preparePdfBytes(prisma, input.batchId as number);
      return NextResponse.json({ batchId: input.batchId, status: "ready" });
    }
    if (input.action === "activate" && Number.isSafeInteger(input.batchId) && Object.keys(input).sort().join(",") === "action,batchId,confirm,fingerprint") {
      return NextResponse.json(await activateOctoberCorrection(prisma, input.batchId as number, input.fingerprint));
    }
    return NextResponse.json({ error: "訂正操作が不正です" }, { status: 400 });
  } catch (error) {
    if (error instanceof OctoberCorrectionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("October invoice correction failed", error);
    return NextResponse.json({ error: "訂正結果が未確定です。管理者がDBと保存PDFを照合してください" }, { status: 503 });
  }
}
