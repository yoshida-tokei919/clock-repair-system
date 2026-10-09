import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stopWorkTimeSession } from "@/lib/work-time-sessions";

export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  return NextResponse.json(await stopWorkTimeSession(prisma));
}
