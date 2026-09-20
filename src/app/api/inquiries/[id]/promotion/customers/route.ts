import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function inquiryIdFromParams(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const customerSelect = { id: true, name: true, companyName: true, type: true, prefix: true, phone: true, lineId: true } as const;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const inquiryId = inquiryIdFromParams(params.id);
  if (!inquiryId) return NextResponse.json({ error: "Invalid inquiry ID" }, { status: 400 });
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: { lineUser: { select: { lineUserId: true } } },
  });
  if (!inquiry) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const strictMatches = await prisma.customer.findMany({
    where: { lineId: inquiry.lineUser.lineUserId },
    select: customerSelect,
    orderBy: { createdAt: "desc" },
  });
  const customers = query
    ? await prisma.customer.findMany({
      where: { OR: [
        { name: { contains: query, mode: "insensitive" } },
        { companyName: { contains: query, mode: "insensitive" } },
        { prefix: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ] },
      select: customerSelect,
      orderBy: { createdAt: "desc" },
      take: 20,
    })
    : [];
  return NextResponse.json({ strictMatches, customers });
}
