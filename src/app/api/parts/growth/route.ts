import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  PartsMasterGrowthCommitError,
  commitPartsMasterGrowth,
} from '@/lib/parts-master-growth-preview'

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const result = await commitPartsMasterGrowth(prisma, body as any)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to commit PartsMaster candidate'
    const status = error instanceof PartsMasterGrowthCommitError ? error.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}
