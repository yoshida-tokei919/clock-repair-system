import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const part = await prisma.partsMaster.findUnique({
    where: { id: Number(params.id) },
    include: { brand: true, caliber: true, baseCaliber: true, supplier: true },
  })
  if (!part) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(part)
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const data = await req.json()
  const part = await prisma.partsMaster.update({
    where: { id: Number(params.id) },
    data,
  })
  return NextResponse.json(part)
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.partsMaster.delete({ where: { id: Number(params.id) } })
  return NextResponse.json({ ok: true })
}
