import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  __partsMasterSearchInfoInternals,
  updatePartsMasterSearchInfo,
} from '@/lib/parts-master-search-info'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid partsMasterId' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const partRefs = typeof (body as { partRefs?: unknown })?.partRefs === 'string'
    ? (body as { partRefs: string }).partRefs
    : ''

  if (__partsMasterSearchInfoInternals.splitPartRefs(partRefs).length === 0) {
    return NextResponse.json({ error: 'partRefs is required' }, { status: 400 })
  }

  const result = await updatePartsMasterSearchInfo(prisma, id, { partRefs })
  if (!result) {
    return NextResponse.json({ error: 'PartsMaster not found' }, { status: 404 })
  }

  return NextResponse.json(result)
}
