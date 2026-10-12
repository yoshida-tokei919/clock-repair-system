import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  JAPAN_POST_TRACKING_CSV_MAX_BYTES,
  previewJapanPostTrackingCsv,
} from "@/lib/japan-post-tracking";
import { YupuriHistoryError } from "@/lib/yupuri-history";
import { cloudWorkerAuthorized } from "../yupuri-cloud/_auth";

export async function japanPostTrackingRoute(
  request: NextRequest,
  preview: typeof previewJapanPostTrackingCsv = previewJapanPostTrackingCsv,
) {
  const headers = { "Cache-Control": "no-store" };
  const authorized = cloudWorkerAuthorized(request);
  if (authorized === null) return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/octet-stream" && contentType !== "text/csv") {
    return NextResponse.json({ error: "unsupported_content_type" }, { status: 415, headers });
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > JAPAN_POST_TRACKING_CSV_MAX_BYTES) {
    return NextResponse.json({ error: "csv_too_large" }, { status: 413, headers });
  }

  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > JAPAN_POST_TRACKING_CSV_MAX_BYTES) {
      return NextResponse.json({ error: "csv_too_large" }, { status: 413, headers });
    }
    return NextResponse.json({ results: await preview(prisma, bytes) }, { headers });
  } catch (error) {
    if (error instanceof YupuriHistoryError) {
      return NextResponse.json({ error: "invalid_csv" }, { status: 400, headers });
    }
    console.error("Japan Post tracking CSV preview failed");
    return NextResponse.json({ error: "preview_failed" }, { status: 500, headers });
  }
}
