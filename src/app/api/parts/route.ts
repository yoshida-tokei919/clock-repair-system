import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createOrUpdatePartsMaster } from '@/lib/parts-master'

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const parts = await prisma.partsMaster.findMany({
    include: {
      brand: true,
      caliber: true,
      supplier: true,
    },
    orderBy: { id: 'desc' },
  })
  return NextResponse.json(parts)
}

export async function POST(req: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const data = await req.json()
  const part = await createOrUpdatePartsMaster(data, prisma)
  return NextResponse.json(part)
}
