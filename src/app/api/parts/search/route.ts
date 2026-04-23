import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const partType = searchParams.get('partType')
  const keyword = searchParams.get('keyword')
  const cal = searchParams.get('cal')
  const ref = searchParams.get('ref')

  const parts = await prisma.partsMaster.findMany({
    where: {
      ...(partType ? { partType } : {}),
      ...(keyword ? {
        OR: [
          { nameJp: { contains: keyword, mode: 'insensitive' } },
          { nameEn: { contains: keyword, mode: 'insensitive' } },
          { partRefs: { contains: keyword, mode: 'insensitive' } },
        ]
      } : {}),
      ...(cal ? {
        OR: [
          { caliber: { name: { contains: cal, mode: 'insensitive' } } },
          { baseCaliber: { name: { contains: cal, mode: 'insensitive' } } },
        ]
      } : {}),
      ...(ref ? {
        OR: [
          { watchRefs: { contains: ref, mode: 'insensitive' } },
          { model: { name: { contains: ref, mode: 'insensitive' } } },
        ]
      } : {}),
    },
    include: {
      caliber: { select: { name: true } },
      baseCaliber: { select: { name: true } },
      brand: { select: { name: true } },
      supplier: { select: { name: true } },
    },
    orderBy: { id: 'desc' },
    take: 100,
  })

  return NextResponse.json(parts)
}
