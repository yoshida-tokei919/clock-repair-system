import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const [brands, models, calibers, suppliers] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: 'asc' } }),
    prisma.model.findMany({ orderBy: { name: 'asc' } }),
    prisma.caliber.findMany({ orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ orderBy: { id: 'asc' } }),
  ])
  return NextResponse.json({ brands, models, calibers, suppliers })
}
