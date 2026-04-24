import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function normalizeMasterName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

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
    const brands = await prisma.brand.findMany({
      select: { id: true, name: true, nameEn: true, nameJp: true, kana: true, initialChar: true },
    })
    const existing = brands.find((brand) => normalizeMasterName(brand.name) === normalizedName)
    if (existing) return NextResponse.json(existing)

    const brand = await prisma.brand.create({
      data: { name, nameJp: name },
    })
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
    const calibers = await prisma.caliber.findMany({
      select: {
        id: true,
        brandId: true,
        name: true,
        nameEn: true,
        nameJp: true,
        movementType: true,
        standardWorkMinutes: true,
      },
    })
    const existing = calibers.find((caliber) => normalizeMasterName(caliber.name) === normalizedName)
    if (existing) return NextResponse.json(existing)

    const caliber = await prisma.caliber.create({
      data: { name },
    })
    return NextResponse.json(caliber)
  }

  return NextResponse.json({ error: 'invalid type' }, { status: 400 })
}
