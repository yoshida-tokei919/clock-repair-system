import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findOrCreateBrand, findOrCreateCaliber, normalizeMasterName } from '@/lib/master-normalize'

export async function GET() {
  const [brands, models, calibers, suppliers] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: 'asc' } }),
    prisma.model.findMany({ orderBy: { name: 'asc' } }),
    prisma.caliber.findMany({ orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ orderBy: { id: 'asc' } }),
  ])
  return NextResponse.json({ brands, models, calibers, suppliers })
}

export async function POST(req: Request) {
  const body = await req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const type = body.type
  const normalizedName = normalizeMasterName(name)

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  if (type === 'brand') {
    const brand = await findOrCreateBrand(prisma, name)
    return NextResponse.json(brand)
  }

  if (type === 'model') {
    const brandId = Number(body.brandId)
    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
    }

    const models = await prisma.model.findMany({
      where: { brandId },
      select: { id: true, brandId: true, name: true, nameEn: true, nameJp: true },
    })
    const existing = models.find((model) => normalizeMasterName(model.name) === normalizedName)
    if (existing) return NextResponse.json(existing)

    const model = await prisma.model.create({
      data: { name, nameJp: name, brandId },
    })
    return NextResponse.json(model)
  }

  if (type === 'caliber') {
    const caliber = await findOrCreateCaliber(prisma, name, Number(body.brandId) || null)
    return NextResponse.json(caliber)
  }

  return NextResponse.json({ error: 'invalid type' }, { status: 400 })
}
