import type { Prisma, PrismaClient } from '@prisma/client'

export type PartsMasterSearchInfoInput = {
  partRefs?: string | null
}

export type PartsMasterSearchInfoResult = {
  part: {
    id: number
    partRefs: string | null
    nameJp: string
    nameEn: string | null
    partType: string | null
    standardPartNameId: string | null
  }
  addedPartRefs: string[]
  skippedPartRefs: string[]
}

type DbLike = PrismaClient | Prisma.TransactionClient

const PART_REF_SPLIT_PATTERN = /[\n,、，]+/

function splitPartRefs(value?: string | null) {
  return (value ?? '')
    .split(PART_REF_SPLIT_PATTERN)
    .map(entry => entry.trim())
    .filter(Boolean)
}

function normalizePartRefForCompare(value?: string | null) {
  return (value ?? '').trim()
}

function mergePartRefs(existing?: string | null, incoming?: string | null) {
  const existingPartRefs = splitPartRefs(existing)
  const incomingPartRefs = splitPartRefs(incoming)
  const knownRefs = new Set(existingPartRefs.map(normalizePartRefForCompare).filter(Boolean))
  const mergedPartRefs = [...existingPartRefs]
  const addedPartRefs: string[] = []
  const skippedPartRefs: string[] = []

  for (const partRef of incomingPartRefs) {
    const normalized = normalizePartRefForCompare(partRef)
    if (!normalized) continue
    if (knownRefs.has(normalized)) {
      skippedPartRefs.push(partRef)
      continue
    }
    knownRefs.add(normalized)
    mergedPartRefs.push(partRef)
    addedPartRefs.push(partRef)
  }

  return {
    partRefs: mergedPartRefs.length > 0 ? mergedPartRefs.join(', ') : null,
    addedPartRefs,
    skippedPartRefs,
  }
}

const partsMasterSearchInfoSelect = {
  id: true,
  partRefs: true,
  nameJp: true,
  nameEn: true,
  partType: true,
  standardPartNameId: true,
} as const

export async function updatePartsMasterSearchInfo(
  db: DbLike,
  id: number,
  input: PartsMasterSearchInfoInput
): Promise<PartsMasterSearchInfoResult | null> {
  const incomingPartRefs = splitPartRefs(input.partRefs)
  if (incomingPartRefs.length === 0) {
    throw new Error('partRefs is required')
  }

  const current = await db.partsMaster.findUnique({
    where: { id },
    select: partsMasterSearchInfoSelect,
  })

  if (!current) return null

  const merged = mergePartRefs(current.partRefs, input.partRefs)
  const part = merged.partRefs === current.partRefs
    ? current
    : await db.partsMaster.update({
      where: { id },
      data: { partRefs: merged.partRefs },
      select: partsMasterSearchInfoSelect,
    })

  return {
    part,
    addedPartRefs: merged.addedPartRefs,
    skippedPartRefs: merged.skippedPartRefs,
  }
}

export const __partsMasterSearchInfoInternals = {
  splitPartRefs,
  normalizePartRefForCompare,
  mergePartRefs,
}
