
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
    try {
        const partners = await prisma.customer.findMany({
            where: { isPartner: true },
            orderBy: { id: 'asc' },
        });

        return NextResponse.json({ partners });
    } catch (error) {
        console.error("Error fetching partners:", error);
        return NextResponse.json({ error: "Failed to fetch partners" }, { status: 500 });
    }
}


export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, prefix, address, phone } = body;

        if (!name || !prefix) {
            return NextResponse.json({ error: "Name and Prefix are required" }, { status: 400 });
        }

        const existing = await prisma.customer.findFirst({
            where: { name: name, isPartner: true }
        });

        if (existing) {
            return NextResponse.json({ error: "Partner already exists" }, { status: 409 });
        }

        const partner = await prisma.customer.create({
            data: {
                type: 'business',
                isPartner: true,
                name,
                prefix,
                currentSeq: 0,
                address: address || "",
                phone: phone || ""
            }
        });

        return NextResponse.json({ partner });
    } catch (error: any) {
        console.error("Create Partner Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
