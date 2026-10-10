import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cloudIssueFailure, nextCloudIssue } from "@/lib/yupuri-cloud-issuance";
import { cloudWorkerAuthorized } from "../_auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorized = cloudWorkerAuthorized(request);
  if (authorized === null) return NextResponse.json({ error: "Internal token is not configured" }, { status: 503 });
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ job: await nextCloudIssue(prisma) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = cloudIssueFailure(error);
    if (failure.status === 500) console.error("Yu-Pri Cloud next job failed");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
