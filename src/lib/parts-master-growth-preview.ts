import type { Prisma, PrismaClient } from '@prisma/client'
import { normalizeCaliberName, normalizeMasterName } from '@/lib/master-normalize'
import { createOrUpdatePartsMaster, type PartsMasterInput } from '@/lib/parts-master'
import { updatePartsMasterSearchInfo } from '@/lib/parts-master-search-info'

type DbLike = PrismaClient | Prisma.TransactionClient

type NullableText = string | null | undefined

export type PartsMasterGrowthPreviewInput = {
  repairId?: number | string | null
  lineItem?: {
    partType?: NullableText
    category?: NullableText
    name?: NullableText
    nameJp?: NullableText
    nameEn?: NullableText
    standardPartNameId?: NullableText
    targetPartNameId?: NullableText
    partRef?: NullableText
    partRefs?: NullableText
    gradeId?: NullableText
    grade?: NullableText
    cousinsNumber?: NullableText
    partsMasterId?: number | string | null
  } | null
  context?: {
    brandId?: number | string | null
    brandName?: NullableText
    modelId?: number | string | null
    modelName?: NullableText
    watchRef?: NullableText
    caliberId?: number | string | null
    caliberName?: NullableText
    movementMakerId?: number | string | null
    movementMakerName?: NullableText
    movementCaliberId?: number | string | null
    movementCaliberName?: NullableText
    baseMovementMakerId?: number | string | null
    baseMovementMakerName?: NullableText
    baseMovementCaliberId?: number | string | null
    baseMovementCaliberName?: NullableText
  } | null
}

export type PartsMasterGrowthPreviewCandidate = {
  id: number
  matchType: 'strong' | 'similar'
  reason: string
  partType: string | null
  category: string
  nameJp: string
  nameEn: string | null
  standardPartNameId: string | null
  gradeId: string | null
  partRefs: string | null
  grade: string | null
  cousinsNumber: string | null
  brandName: string | null
  modelName: string | null
  watchRefs: string | null
  movementMakerName: string | null
  movementCaliberName: string | null
  baseMovementMakerName: string | null
  baseMovementCaliberName: string | null
}

export type PartsMasterGrowthPreviewResult = {
  preview: {
    partType: 'interior' | 'exterior' | null
    category: string | null
    name: string | null
    nameJp: string | null
    nameEn: string | null
    standardPartNameId: string | null
    gradeId: string | null
    partRefs: string | null
    grade: string | null
    cousinsNumber: string | null
    brandId: number | null
    brandName: string | null
    modelId: number | null
    modelName: string | null
    watchRef: string | null
    movementMakerId: number | null
    movementMakerName: string | null
    movementCaliberId: number | null
    movementCaliberName: string | null
    baseMovementMakerId: number | null
    baseMovementMakerName: string | null
    baseMovementCaliberId: number | null
    baseMovementCaliberName: string | null
    missingRequiredFields: string[]
    contextWarnings: string[]
    readyForCreate: boolean
  }
  strongMatches: PartsMasterGrowthPreviewCandidate[]
  similarCandidates: PartsMasterGrowthPreviewCandidate[]
  createCandidate: PartsMasterGrowthPreviewResult['preview']
}

export type PartsMasterGrowthCommitInput = PartsMasterGrowthPreviewInput & {
  action?: 'use-existing' | 'create'
  partsMasterId?: number | string | null
}

export type PartsMasterGrowthCommitResult = {
  action: 'use-existing' | 'create'
  part: PartsMasterGrowthResolvedPart
  preview: PartsMasterGrowthPreviewResult
  addedPartRefs: string[]
  skippedPartRefs: string[]
}

export type PartsMasterGrowthResolvedPart = {
  id: number
  partType: string | null
  category: string
  nameJp: string
  nameEn: string | null
  standardPartNameId: string | null
  gradeId: string | null
  partRefs: string | null
  cousinsNumber: string | null
  grade: string | null
  notes1: string | null
  notes2: string | null
  retailPrice: number
  latestCostYen: number
  stockQuantity: number
  brand: { name: string } | null
  model: { name: string } | null
  caliber: { name: string } | null
  baseCaliber: { name: string } | null
  supplier: { name: string } | null
}

export class PartsMasterGrowthCommitError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PartsMasterGrowthCommitError'
    this.status = status
  }
}

const PART_REF_SPLIT_PATTERN = /[\n,、，]+/

function cleanText(value?: NullableText) {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim()
  return trimmed || null
}

function parseNullableInt(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function splitMultiValue(value?: NullableText) {
  return (value ?? '')
    .split(PART_REF_SPLIT_PATTERN)
    .map(entry => entry.trim())
    .filter(Boolean)
}

function normalizePartRefForCompare(value?: NullableText) {
  return (value ?? '').trim()
}

function hasPartRefOverlap(left?: NullableText, right?: NullableText) {
  const leftSet = new Set(splitMultiValue(left).map(normalizePartRefForCompare).filter(Boolean))
  if (leftSet.size === 0) return false
  return splitMultiValue(right).some(ref => leftSet.has(normalizePartRefForCompare(ref)))
}

function hasTextOverlap(left?: NullableText, right?: NullableText) {
  const leftSet = new Set(splitMultiValue(left).map(normalizeMasterName).filter(Boolean))
  if (leftSet.size === 0) return false
  return splitMultiValue(right).some(value => leftSet.has(normalizeMasterName(value)))
}

function normalizePartType(partType?: NullableText, category?: NullableText): 'interior' | 'exterior' | null {
  const cleanedPartType = cleanText(partType)
  if (cleanedPartType === 'interior' || cleanedPartType === 'internal' || cleanedPartType === 'part_internal') return 'interior'
  if (cleanedPartType === 'exterior' || cleanedPartType === 'external' || cleanedPartType === 'part_external') return 'exterior'

  const cleanedCategory = cleanText(category)
  if (cleanedCategory === 'internal' || cleanedCategory === 'part_internal') return 'interior'
  if (cleanedCategory === 'external' || cleanedCategory === 'part_external') return 'exterior'
  return null
}

function normalizeCategoryForCandidate(partType: 'interior' | 'exterior' | null, category?: NullableText) {
  const cleaned = cleanText(category)
  if (cleaned === 'internal' || cleaned === 'external' || cleaned === 'generic') return cleaned
  if (cleaned === 'part_internal') return 'internal'
  if (cleaned === 'part_external') return 'external'
  if (partType === 'interior') return 'internal'
  if (partType === 'exterior') return 'external'
  return cleaned
}

async function findBrandByName(db: DbLike, name?: NullableText) {
  const normalized = normalizeMasterName(name)
  if (!normalized) return null
  const brands = await db.brand.findMany({
    select: { id: true, name: true, nameEn: true, nameJp: true },
  })
  return brands.find(brand =>
    [brand.name, brand.nameEn, brand.nameJp].some(value => normalizeMasterName(value) === normalized)
  ) ?? null
}

async function findModelByName(db: DbLike, brandId: number | null, name?: NullableText) {
  const normalized = normalizeMasterName(name)
  if (!normalized) return null
  const models = await db.model.findMany({
    where: brandId ? { brandId } : undefined,
    select: { id: true, brandId: true, name: true, nameEn: true, nameJp: true },
  })
  return models.find(model =>
    [model.name, model.nameEn, model.nameJp].some(value => normalizeMasterName(value) === normalized)
  ) ?? null
}

async function findCaliberByName(db: DbLike, brandId: number | null, name?: NullableText) {
  const normalized = normalizeCaliberName(name)
  if (!normalized) return null
  const calibers = await db.caliber.findMany({
    where: brandId ? { brandId } : undefined,
    select: { id: true, brandId: true, name: true, nameEn: true, nameJp: true },
  })
  return calibers.find(caliber =>
    [caliber.name, caliber.nameEn, caliber.nameJp].some(value => normalizeCaliberName(value) === normalized)
  ) ?? null
}

async function findGradeByName(db: DbLike, name?: NullableText) {
  const cleaned = cleanText(name)
  if (!cleaned) return null
  const grades = await db.partGradeMaster.findMany({
    where: { isActive: true },
    select: { id: true, key: true, nameJa: true, nameEn: true },
  })
  return grades.find(grade =>
    [grade.id, grade.key, grade.nameJa, grade.nameEn].some(value => cleanText(value) === cleaned)
  ) ?? null
}

function gradeMatches(
  left: { gradeId?: NullableText; grade?: NullableText },
  right: { gradeId?: NullableText; grade?: NullableText }
) {
  const leftGradeId = cleanText(left.gradeId)
  const rightGradeId = cleanText(right.gradeId)
  if (leftGradeId && rightGradeId) return leftGradeId === rightGradeId

  const leftGrade = cleanText(left.grade)
  const rightGrade = cleanText(right.grade)
  if (leftGrade || rightGrade) return leftGrade === rightGrade

  return !leftGradeId && !rightGradeId
}

function toCandidate(part: any, matchType: 'strong' | 'similar', reason: string): PartsMasterGrowthPreviewCandidate {
  return {
    id: part.id,
    matchType,
    reason,
    partType: part.partType,
    category: part.category,
    nameJp: part.nameJp,
    nameEn: part.nameEn,
    standardPartNameId: part.standardPartNameId,
    gradeId: part.gradeId,
    partRefs: part.partRefs,
    grade: part.grade,
    cousinsNumber: part.cousinsNumber,
    brandName: part.brand?.name ?? null,
    modelName: part.model?.name ?? null,
    watchRefs: part.watchRefs,
    movementMakerName: part.movementMaker?.name ?? null,
    movementCaliberName: part.caliber?.name ?? null,
    baseMovementMakerName: part.baseMaker?.name ?? null,
    baseMovementCaliberName: part.baseCaliber?.name ?? null,
  }
}

const resolvedPartSelect = {
  id: true,
  partType: true,
  category: true,
  nameJp: true,
  nameEn: true,
  standardPartNameId: true,
  gradeId: true,
  partRefs: true,
  cousinsNumber: true,
  grade: true,
  notes1: true,
  notes2: true,
  retailPrice: true,
  latestCostYen: true,
  stockQuantity: true,
  brand: { select: { name: true } },
  model: { select: { name: true } },
  caliber: { select: { name: true } },
  baseCaliber: { select: { name: true } },
  supplier: { select: { name: true } },
} as const

async function getResolvedPart(db: DbLike, id: number): Promise<PartsMasterGrowthResolvedPart | null> {
  return await db.partsMaster.findUnique({
    where: { id },
    select: resolvedPartSelect,
  })
}

function buildCreateInput(preview: PartsMasterGrowthPreviewResult['preview']): PartsMasterInput {
  const common: PartsMasterInput = {
    partType: preview.partType,
    category: preview.category,
    standardPartNameId: preview.standardPartNameId,
    gradeId: preview.gradeId,
    name: preview.nameJp,
    nameJp: preview.nameJp,
    nameEn: preview.nameEn,
    partRefs: preview.partRefs,
    cousinsNumber: preview.cousinsNumber,
    grade: preview.grade,
  }

  if (preview.partType === 'interior') {
    return {
      ...common,
      caliberId: preview.movementCaliberId,
      caliberName: preview.movementCaliberName,
      baseCaliberId: preview.baseMovementCaliberId,
      baseCaliberName: preview.baseMovementCaliberName,
      movementMakerId: preview.movementMakerId,
      movementMakerName: preview.movementMakerName,
      baseMakerId: preview.baseMovementMakerId,
      baseMakerName: preview.baseMovementMakerName,
    }
  }

  return {
    ...common,
    brandId: preview.brandId,
    brandName: preview.brandName,
    modelId: preview.modelId,
    modelName: preview.modelName,
    watchRefs: preview.watchRef,
  }
}

export async function previewPartsMasterGrowth(
  db: DbLike,
  input: PartsMasterGrowthPreviewInput
): Promise<PartsMasterGrowthPreviewResult> {
  const repairId = parseNullableInt(input.repairId)
  const repair = repairId
    ? await db.repair.findUnique({
      where: { id: repairId },
      include: {
        movementMaker: true,
        movementCaliber: true,
        baseMovementMaker: true,
        baseMovementCaliber: true,
        watch: {
          include: {
            brand: true,
            model: true,
            reference: true,
            caliber: true,
          },
        },
      },
    })
    : null

  const partType = normalizePartType(input.lineItem?.partType, input.lineItem?.category)
  const category = normalizeCategoryForCandidate(partType, input.lineItem?.category)
  const nameJp = cleanText(input.lineItem?.nameJp) ?? cleanText(input.lineItem?.name)
  const nameEn = cleanText(input.lineItem?.nameEn)
  const partRefs = splitMultiValue(input.lineItem?.partRefs ?? input.lineItem?.partRef).join(', ') || null
  const standardPartNameId = cleanText(input.lineItem?.standardPartNameId) ?? cleanText(input.lineItem?.targetPartNameId)
  const grade = cleanText(input.lineItem?.grade)
  const gradeId = cleanText(input.lineItem?.gradeId) ?? (await findGradeByName(db, grade))?.id ?? null

  const directBrandId = parseNullableInt(input.context?.brandId)
  const repairBrandId = repair?.watch?.brandId ?? null
  const brandByName = !directBrandId && !repairBrandId ? await findBrandByName(db, input.context?.brandName) : null
  const brandId = directBrandId ?? repairBrandId ?? brandByName?.id ?? null
  const brandName = cleanText(input.context?.brandName) ?? repair?.watch?.brand?.name ?? brandByName?.name ?? null

  const directModelId = parseNullableInt(input.context?.modelId)
  const repairModelId = repair?.watch?.modelId ?? null
  const modelByName = !directModelId && !repairModelId ? await findModelByName(db, brandId, input.context?.modelName) : null
  const modelId = directModelId ?? repairModelId ?? modelByName?.id ?? null
  const modelName = cleanText(input.context?.modelName) ?? repair?.watch?.model?.name ?? modelByName?.name ?? null

  const directCaliberId = parseNullableInt(input.context?.caliberId)
  const repairCaliberId = repair?.watch?.caliberId ?? null
  const caliberByName = !directCaliberId && !repairCaliberId ? await findCaliberByName(db, brandId, input.context?.caliberName) : null
  const caliberId = directCaliberId ?? repairCaliberId ?? caliberByName?.id ?? null

  const directMovementMakerId = parseNullableInt(input.context?.movementMakerId)
  const repairMovementMakerId = repair?.movementMakerId ?? null
  const movementMakerByName = !directMovementMakerId && !repairMovementMakerId ? await findBrandByName(db, input.context?.movementMakerName) : null
  const movementMakerId = directMovementMakerId ?? repairMovementMakerId ?? movementMakerByName?.id ?? null
  const movementMakerName = cleanText(input.context?.movementMakerName) ?? repair?.movementMaker?.name ?? movementMakerByName?.name ?? null

  const directMovementCaliberId = parseNullableInt(input.context?.movementCaliberId)
  const repairMovementCaliberId = repair?.movementCaliberId ?? null
  const movementCaliberByName = !directMovementCaliberId && !repairMovementCaliberId
    ? await findCaliberByName(db, movementMakerId, input.context?.movementCaliberName)
    : null
  const movementCaliberId = directMovementCaliberId ?? repairMovementCaliberId ?? movementCaliberByName?.id ?? null
  const movementCaliberName = cleanText(input.context?.movementCaliberName) ?? repair?.movementCaliber?.name ?? movementCaliberByName?.name ?? null

  const directBaseMovementMakerId = parseNullableInt(input.context?.baseMovementMakerId)
  const repairBaseMovementMakerId = repair?.baseMovementMakerId ?? null
  const baseMovementMakerByName = !directBaseMovementMakerId && !repairBaseMovementMakerId
    ? await findBrandByName(db, input.context?.baseMovementMakerName)
    : null
  const baseMovementMakerId = directBaseMovementMakerId ?? repairBaseMovementMakerId ?? baseMovementMakerByName?.id ?? null
  const baseMovementMakerName = cleanText(input.context?.baseMovementMakerName) ?? repair?.baseMovementMaker?.name ?? baseMovementMakerByName?.name ?? null

  const directBaseMovementCaliberId = parseNullableInt(input.context?.baseMovementCaliberId)
  const repairBaseMovementCaliberId = repair?.baseMovementCaliberId ?? null
  const baseMovementCaliberByName = !directBaseMovementCaliberId && !repairBaseMovementCaliberId
    ? await findCaliberByName(db, baseMovementMakerId, input.context?.baseMovementCaliberName)
    : null
  const baseMovementCaliberId = directBaseMovementCaliberId ?? repairBaseMovementCaliberId ?? baseMovementCaliberByName?.id ?? null
  const baseMovementCaliberName = cleanText(input.context?.baseMovementCaliberName) ?? repair?.baseMovementCaliber?.name ?? baseMovementCaliberByName?.name ?? null

  const watchRef = cleanText(input.context?.watchRef) ?? repair?.watch?.reference?.name ?? null

  const missingRequiredFields = [
    !partType ? 'partType' : null,
    !category ? 'category' : null,
    !nameJp ? 'nameJp' : null,
    !partRefs ? 'partRefs' : null,
  ].filter((value): value is string => Boolean(value))

  const contextWarnings = [
    partType === 'interior' && !movementMakerId ? 'movementMakerId' : null,
    partType === 'interior' && !movementCaliberId ? 'movementCaliberId' : null,
    partType === 'exterior' && !brandId ? 'brandId' : null,
    partType === 'exterior' && !watchRef ? 'watchRef' : null,
  ].filter((value): value is string => Boolean(value))

  const previewBrandId = partType === 'exterior' ? brandId : null
  const previewBrandName = partType === 'exterior' ? brandName : null
  const previewModelId = partType === 'exterior' ? modelId : null
  const previewModelName = partType === 'exterior' ? modelName : null
  const previewWatchRef = partType === 'exterior' ? watchRef : null
  const previewMovementMakerId = partType === 'interior' ? movementMakerId : null
  const previewMovementMakerName = partType === 'interior' ? movementMakerName : null
  const previewMovementCaliberId = partType === 'interior' ? movementCaliberId : null
  const previewMovementCaliberName = partType === 'interior' ? movementCaliberName : null
  const previewBaseMovementMakerId = partType === 'interior' ? baseMovementMakerId : null
  const previewBaseMovementMakerName = partType === 'interior' ? baseMovementMakerName : null
  const previewBaseMovementCaliberId = partType === 'interior' ? baseMovementCaliberId : null
  const previewBaseMovementCaliberName = partType === 'interior' ? baseMovementCaliberName : null

  const preview = {
    partType,
    category,
    name: nameJp,
    nameJp,
    nameEn,
    standardPartNameId,
    gradeId,
    partRefs,
    grade,
    cousinsNumber: cleanText(input.lineItem?.cousinsNumber),
    brandId: previewBrandId,
    brandName: previewBrandName,
    modelId: previewModelId,
    modelName: previewModelName,
    watchRef: previewWatchRef,
    movementMakerId: previewMovementMakerId,
    movementMakerName: previewMovementMakerName,
    movementCaliberId: previewMovementCaliberId,
    movementCaliberName: previewMovementCaliberName,
    baseMovementMakerId: previewBaseMovementMakerId,
    baseMovementMakerName: previewBaseMovementMakerName,
    baseMovementCaliberId: previewBaseMovementCaliberId,
    baseMovementCaliberName: previewBaseMovementCaliberName,
    missingRequiredFields,
    contextWarnings,
    readyForCreate: missingRequiredFields.length === 0,
  }

  if (!partType) {
    return { preview, strongMatches: [], similarCandidates: [], createCandidate: preview }
  }

  const typeWhere = partType === 'interior'
    ? { OR: [{ partType: 'interior' }, { category: 'internal' }] }
    : { OR: [{ partType: 'exterior' }, { category: 'external' }] }

  const parts = await db.partsMaster.findMany({
    where: typeWhere,
    include: {
      brand: true,
      model: true,
      caliber: true,
      baseCaliber: true,
      movementMaker: true,
      baseMaker: true,
    },
    orderBy: { id: 'desc' },
    take: 500,
  })

  const strongMatches: PartsMasterGrowthPreviewCandidate[] = []
  const similarCandidates: PartsMasterGrowthPreviewCandidate[] = []
  const seenIds = new Set<number>()

  for (const part of parts) {
    if (partType === 'interior') {
      const strong = Boolean(
        movementMakerId &&
        movementCaliberId &&
        part.movementMakerId === movementMakerId &&
        part.caliberId === movementCaliberId &&
        hasPartRefOverlap(partRefs, part.partRefs) &&
        gradeMatches({ gradeId, grade }, part)
      )
      if (strong) {
        strongMatches.push(toCandidate(part, 'strong', 'movementMakerId + movementCaliberId + partRef + grade'))
        seenIds.add(part.id)
        continue
      }

      const similarByStandardName = Boolean(
        movementCaliberId &&
        standardPartNameId &&
        part.caliberId === movementCaliberId &&
        part.standardPartNameId === standardPartNameId
      )
      const similarByName = Boolean(
        movementCaliberId &&
        !standardPartNameId &&
        part.caliberId === movementCaliberId &&
        normalizeMasterName(part.nameJp) === normalizeMasterName(nameJp)
      )
      if ((similarByStandardName || similarByName) && !seenIds.has(part.id)) {
        similarCandidates.push(toCandidate(
          part,
          'similar',
          similarByStandardName ? 'movementCaliberId + standardPartNameId' : 'movementCaliberId + nameJp'
        ))
        seenIds.add(part.id)
      }
      continue
    }

    const strong = Boolean(
      brandId &&
      part.brandId === brandId &&
      hasPartRefOverlap(partRefs, part.partRefs) &&
      gradeMatches({ gradeId, grade }, part)
    )
    if (strong) {
      strongMatches.push(toCandidate(part, 'strong', 'brandId + partRef + grade'))
      seenIds.add(part.id)
      continue
    }

    const sameBrand = Boolean(brandId && part.brandId === brandId)
    const similarByWatchRef = Boolean(
      sameBrand &&
      watchRef &&
      standardPartNameId &&
      hasTextOverlap(watchRef, part.watchRefs) &&
      part.standardPartNameId === standardPartNameId
    )
    const similarByModel = Boolean(
      sameBrand &&
      modelId &&
      standardPartNameId &&
      part.modelId === modelId &&
      part.standardPartNameId === standardPartNameId
    )
    const similarByName = Boolean(
      sameBrand &&
      !standardPartNameId &&
      normalizeMasterName(part.nameJp) === normalizeMasterName(nameJp)
    )
    if ((similarByWatchRef || similarByModel || similarByName) && !seenIds.has(part.id)) {
      similarCandidates.push(toCandidate(
        part,
        'similar',
        similarByWatchRef
          ? 'brandId + watchRef + standardPartNameId'
          : similarByModel
            ? 'brandId + modelId + standardPartNameId'
            : 'brandId + nameJp'
      ))
      seenIds.add(part.id)
    }
  }

  return {
    preview,
    strongMatches: strongMatches.slice(0, 10),
    similarCandidates: similarCandidates.slice(0, 10),
    createCandidate: preview,
  }
}

export async function commitPartsMasterGrowth(
  db: DbLike,
  input: PartsMasterGrowthCommitInput
): Promise<PartsMasterGrowthCommitResult> {
  const action = input.action
  if (action !== 'use-existing' && action !== 'create') {
    throw new PartsMasterGrowthCommitError('action is required', 400)
  }

  const preview = await previewPartsMasterGrowth(db, input)
  const incomingPartRefs = preview.preview.partRefs
  const addedPartRefs: string[] = []
  const skippedPartRefs: string[] = []

  if (action === 'use-existing') {
    const partsMasterId = parseNullableInt(input.partsMasterId ?? input.lineItem?.partsMasterId)
    if (!partsMasterId) {
      throw new PartsMasterGrowthCommitError('partsMasterId is required', 400)
    }

    let part = await getResolvedPart(db, partsMasterId)
    if (!part) {
      throw new PartsMasterGrowthCommitError('PartsMaster not found', 404)
    }
    if (!gradeMatches(preview.preview, part)) {
      throw new PartsMasterGrowthCommitError('Grade mismatch. Select or create a PartsMaster with the same grade.', 409)
    }

    if (incomingPartRefs) {
      const searchInfoResult = await updatePartsMasterSearchInfo(db, partsMasterId, { partRefs: incomingPartRefs })
      if (!searchInfoResult) {
        throw new PartsMasterGrowthCommitError('PartsMaster not found', 404)
      }
      addedPartRefs.push(...searchInfoResult.addedPartRefs)
      skippedPartRefs.push(...searchInfoResult.skippedPartRefs)
      part = await getResolvedPart(db, partsMasterId)
      if (!part) {
        throw new PartsMasterGrowthCommitError('PartsMaster not found', 404)
      }
    }

    return {
      action,
      part,
      preview,
      addedPartRefs,
      skippedPartRefs,
    }
  }

  if (preview.preview.missingRequiredFields.length > 0) {
    throw new PartsMasterGrowthCommitError(
      `required fields are missing: ${preview.preview.missingRequiredFields.join(', ')}`,
      400
    )
  }
  if (preview.strongMatches.length > 0) {
    throw new PartsMasterGrowthCommitError('Strong matching PartsMaster exists. Select the existing PartsMaster instead.', 409)
  }

  const created = await createOrUpdatePartsMaster(buildCreateInput(preview.preview), db)
  const part = await getResolvedPart(db, created.id)
  if (!part) {
    throw new PartsMasterGrowthCommitError('Created PartsMaster not found', 500)
  }

  return {
    action,
    part,
    preview,
    addedPartRefs: incomingPartRefs ? splitMultiValue(incomingPartRefs) : [],
    skippedPartRefs,
  }
}

export const __partsMasterGrowthPreviewInternals = {
  cleanText,
  splitMultiValue,
  normalizePartRefForCompare,
  hasPartRefOverlap,
  gradeMatches,
  normalizePartType,
  normalizeCategoryForCandidate,
}
