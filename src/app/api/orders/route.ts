import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const orders = await prisma.orderRequest.findMany({
    where: {
      status: { in: ['pending', 'ordered'] }
    },
    include: {
      partsMaster: {
        select: {
          nameJp: true,
          nameEn: true,
          partRefs: true,
          cousinsNumber: true,
        }
      },
      supplier: { select: { name: true } },
      repair: {
        select: {
          inquiryNumber: true,
          customer: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  })
  return NextResponse.json(orders)
}
