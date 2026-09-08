import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { photoSharingFallbacks, repairPhotoCategories } from "@/lib/repair-photo-sharing";

export async function GET() {
  try {
    const rows = await prisma.photoSharingDefault.findMany();
    const values = Object.fromEntries(repairPhotoCategories.map((category) => [
      category,
      rows.find((row) => row.category === category) ?? { category, ...photoSharingFallbacks[category] },
    ]));
    return NextResponse.json(values);
  } catch (error) {
    console.error("Photo sharing defaults error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.defaults)) {
      return NextResponse.json({ error: "defaults must be an array" }, { status: 400 });
    }
    const rows = body.defaults.filter((row: unknown): row is {
      category: (typeof repairPhotoCategories)[number];
      customerVisible: boolean;
      publicCaseVisible: boolean;
      snsVisible: boolean;
    } => {
      if (!row || typeof row !== "object") return false;
      const value = row as Record<string, unknown>;
      return repairPhotoCategories.includes(value.category as (typeof repairPhotoCategories)[number])
        && typeof value.customerVisible === "boolean"
        && typeof value.publicCaseVisible === "boolean"
        && typeof value.snsVisible === "boolean";
    });
    if (rows.length !== repairPhotoCategories.length) {
      return NextResponse.json({ error: "All photo categories are required" }, { status: 400 });
    }

    await prisma.$transaction(rows.map((row: (typeof rows)[number]) => prisma.photoSharingDefault.upsert({
      where: { category: row.category },
      create: row,
      update: {
        customerVisible: row.customerVisible,
        publicCaseVisible: row.publicCaseVisible,
        snsVisible: row.snsVisible,
      },
    })));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Photo sharing defaults update error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
