import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { previewPartsMasterGrowth } from '@/lib/parts-master-growth-preview'

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const result = await previewPartsMasterGrowth(prisma, body as any)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to preview PartsMaster candidate'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
