import { requireAdminApi } from "@/lib/admin-api-auth";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "10");

        const repairs = await prisma.repair.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                customer: true,
                watch: {
                    include: {
                        brand: true,
                        model: true
                    }
                }
            }
        });

        return NextResponse.json({ success: true, repairs });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false, error: "Failed to fetch recent repairs" }, { status: 500 });
    }
}
