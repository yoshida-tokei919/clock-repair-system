import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''

  const customers = await prisma.customer.findMany({
    where: search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { kana: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ]
    } : {},
    select: {
      id: true,
      name: true,
      kana: true,
      type: true,
      companyName: true,
      phone: true,
      email: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(customers)
}
