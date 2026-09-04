'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PART_SEARCH_SITES,
  buildEnglishPartQueries,
  buildJapanesePartQueries,
  buildProfiledPartSearchQuery,
  buildProfiledSearchUrls,
  getDefaultSearchSiteProfiles,
  normalizePartSearchDomain,
  normalizeSearchSites,
  type PartIdentifierMode,
  type PartSearchContext,
  type SearchPartDomain,
  type SearchProfileToken,
  type SearchSite,
  type SearchSiteProfile,
  type SearchSiteProfiles,
} from '@/lib/part-search'

type Props = {
  repairId?: number | null
  brandId?: number | null
  brandName?: string
  modelId?: number | null
  modelName?: string
  watchCaliberId?: number | null
  watchRef?: string
  cal?: string
  partType?: 'interior' | 'exterior'
  categoryLabel?: string
  partName?: string
  partNameEn?: string
  standardPartNameId?: string | null
  partRef?: string
  gradeId?: string | null
  grade?: string
  movementMakerId?: number | null
  movementMaker?: string
  movementCaliberId?: number | null
  movementCaliber?: string
  baseMovementMakerId?: number | null
  baseMovementMaker?: string
  baseMovementCaliberId?: number | null
  baseMovementCaliber?: string
  partsMasterId?: number | null
  disabled?: boolean
  onResolvePart?: (part: ResolvedPartSelection) => void
}

type TemporaryProfiles = Record<string, Partial<SearchSiteProfiles>>

type GrowthPreviewCandidate = {
  id: number
  matchType: 'strong' | 'similar'
  reason: string
  partType: string | null
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

type GrowthPreviewResult = {
  preview: {
    partType: 'interior' | 'exterior' | null
    category: string | null
    nameJp: string | null
    nameEn: string | null
    standardPartNameId: string | null
    gradeId: string | null
    partRefs: string | null
    brandName: string | null
    modelName: string | null
    watchRef: string | null
    movementMakerName: string | null
    movementCaliberName: string | null
    baseMovementMakerName: string | null
    baseMovementCaliberName: string | null
    missingRequiredFields: string[]
    contextWarnings: string[]
    readyForCreate: boolean
  }
  strongMatches: GrowthPreviewCandidate[]
  similarCandidates: GrowthPreviewCandidate[]
}

type GrowthCommitResult = {
  action: 'use-existing' | 'create'
  part: {
    id: number
    partType: string | null
    nameJp: string
    nameEn: string | null
    partRefs: string | null
    cousinsNumber: string | null
    grade: string | null
    notes1: string | null
    notes2: string | null
    retailPrice: number
    latestCostYen: number
    stockQuantity: number
    supplier: { name: string } | null
  }
  addedPartRefs: string[]
  skippedPartRefs: string[]
}

type ResolvedPartSelection = {
  id: number
  partsMasterId?: number
  partType?: string
  name: string
  nameJp?: string
  nameEn?: string | null
  grade: string
  note1: string
  note2: string
  partRef: string
  partRefs?: string
  cousinsNumber: string
  price: number
  retailPrice?: number
  cost: number
  latestCostYen?: number
  stockQuantity: number
  supplierName: string
}

const PART_SEARCH_SITES_STORAGE_KEY = 'repair-part-search-sites:v1'
const PART_SEARCH_SITES_PANEL_BACKUP_KEY = 'repair-part-search-sites:v1:parts-panel'

const TOKEN_LABELS: Record<SearchProfileToken, string> = {
  watchBrand: '時計ブランド',
  watchRef: '時計Ref',
  model: 'モデル',
  movementMaker: 'ムーブメントメーカー',
  movementCaliber: 'Cal',
  baseMovementMaker: 'ベースメーカー',
  baseMovementCaliber: 'ベースCal',
}

const PART_IDENTIFIER_LABELS: Record<PartIdentifierMode, string> = {
  partName: '部品名',
  partRef: '部品番号',
  partNameAndRef: '部品名 + 部品番号',
}

const INTERNAL_TOKENS: SearchProfileToken[] = [
  'watchBrand',
  'movementMaker',
  'movementCaliber',
  'baseMovementMaker',
  'baseMovementCaliber',
]

const EXTERIOR_TOKENS: SearchProfileToken[] = ['watchBrand', 'watchRef', 'model']
const PART_IDENTIFIER_MODES: PartIdentifierMode[] = ['partName', 'partRef', 'partNameAndRef']

function readStoredSearchSites(key: string) {
  if (typeof window === 'undefined') return []
  try {
    const saved = window.localStorage.getItem(key)
    return normalizeSearchSites(saved ? JSON.parse(saved) : null, [])
  } catch {
    return []
  }
}

function persistSearchSites(sites: SearchSite[]) {
  if (typeof window === 'undefined') return
  const normalized = normalizeSearchSites(sites)
  const serialized = JSON.stringify(normalized)
  window.localStorage.setItem(PART_SEARCH_SITES_STORAGE_KEY, serialized)
  window.localStorage.setItem(PART_SEARCH_SITES_PANEL_BACKUP_KEY, serialized)
}

function getStoredProfile(site: SearchSite, domain: SearchPartDomain): SearchSiteProfile {
  return site.profiles?.[domain] ?? getDefaultSearchSiteProfiles(site)[domain]
}

function getEffectiveProfile(site: SearchSite, domain: SearchPartDomain, temporaryProfiles: TemporaryProfiles): SearchSiteProfile {
  return temporaryProfiles[site.id]?.[domain] ?? getStoredProfile(site, domain)
}

function applyProfileToSite(site: SearchSite, domain: SearchPartDomain, profile: SearchSiteProfile): SearchSite {
  const profiles = site.profiles ?? getDefaultSearchSiteProfiles(site)
  return {
    ...site,
    profiles: {
      ...profiles,
      [domain]: profile,
    },
  }
}

function updateTemporaryProfile(
  temporaryProfiles: TemporaryProfiles,
  siteId: string,
  domain: SearchPartDomain,
  profile: SearchSiteProfile
): TemporaryProfiles {
  return {
    ...temporaryProfiles,
    [siteId]: {
      ...temporaryProfiles[siteId],
      [domain]: profile,
    },
  }
}

function removeTemporaryProfile(
  temporaryProfiles: TemporaryProfiles,
  siteId: string,
  domain: SearchPartDomain
): TemporaryProfiles {
  const siteProfiles = temporaryProfiles[siteId]
  if (!siteProfiles?.[domain]) return temporaryProfiles
  const nextSiteProfiles = { ...siteProfiles }
  delete nextSiteProfiles[domain]
  const next = { ...temporaryProfiles }
  if (nextSiteProfiles.internal || nextSiteProfiles.exterior) {
    next[siteId] = nextSiteProfiles
  } else {
    delete next[siteId]
  }
  return next
}

function toggleToken(tokens: SearchProfileToken[], token: SearchProfileToken, checked: boolean) {
  if (checked) return tokens.includes(token) ? tokens : [...tokens, token]
  return tokens.filter(item => item !== token)
}

function firstPartRef(value?: string | null) {
  return (value ?? '')
    .split(/[\n,、，]+/)
    .map(entry => entry.trim())
    .filter(Boolean)[0] ?? ''
}

function formatPartRefSaveMessage(addedPartRefs: string[], skippedPartRefs: string[]) {
  if (addedPartRefs.length > 0) return `保存しました: ${addedPartRefs.join(', ')}`
  if (skippedPartRefs.length > 0) return `登録済みです: ${skippedPartRefs.join(', ')}`
  return '保存しました'
}

function formatGrowthPreviewContext(preview: GrowthPreviewResult['preview']) {
  const contextMaker = preview.partType === 'interior'
    ? preview.movementMakerName || preview.baseMovementMakerName || '-'
    : preview.brandName || '-'
  const contextModel = preview.partType === 'interior'
    ? preview.movementCaliberName || preview.baseMovementCaliberName || '-'
    : preview.watchRef || preview.modelName || '-'

  return `${preview.partType || '-'} / ${contextMaker} / ${contextModel} / ${preview.nameJp || '-'} / Ref: ${preview.partRefs || '-'}`
}

function toResolvedPartSelection(result: GrowthCommitResult): ResolvedPartSelection {
  const part = result.part
  return {
    id: part.id,
    partsMasterId: part.id,
    partType: part.partType ?? undefined,
    name: part.nameJp,
    nameJp: part.nameJp,
    nameEn: part.nameEn,
    grade: part.grade ?? '',
    note1: part.notes1 ?? '',
    note2: part.notes2 ?? '',
    partRef: firstPartRef(part.partRefs),
    partRefs: part.partRefs ?? '',
    cousinsNumber: part.cousinsNumber ?? '',
    price: part.retailPrice,
    retailPrice: part.retailPrice,
    cost: part.latestCostYen,
    latestCostYen: part.latestCostYen,
    stockQuantity: part.stockQuantity ?? 0,
    supplierName: part.supplier?.name ?? '',
  }
}

function missingPartIdentifierLabel(profile: SearchSiteProfile, context: PartSearchContext, lang: 'ja' | 'en') {
  const hasPartRef = Boolean(context.partRef?.trim())
  const hasPartName = lang === 'en'
    ? Boolean(context.partNameEn?.trim() || context.partName?.trim())
    : Boolean(context.partName?.trim())

  if (profile.partIdentifierMode === 'partRef' && !hasPartRef) return '部品番号未登録'
  if (profile.partIdentifierMode === 'partName' && !hasPartName) return '部品名未入力'
  if (profile.partIdentifierMode === 'partNameAndRef' && !hasPartRef && !hasPartName) return '部品名/部品番号未入力'
  return ''
}

export default function PartsWebSearchPanel({
  repairId,
  brandId,
  brandName,
  modelId,
  modelName,
  watchCaliberId,
  watchRef,
  cal,
  partType,
  categoryLabel,
  partName,
  partNameEn,
  standardPartNameId,
  partRef,
  gradeId,
  grade,
  movementMakerId,
  movementMaker,
  movementCaliberId,
  movementCaliber,
  baseMovementMakerId,
  baseMovementMaker,
  baseMovementCaliberId,
  baseMovementCaliber,
  partsMasterId,
  disabled = false,
  onResolvePart,
}: Props) {
  const [keyword, setKeyword] = useState(partName ?? '')
  const [activePartRef, setActivePartRef] = useState(() => firstPartRef(partRef))
  const [savedPartRefs, setSavedPartRefs] = useState(partRef ?? '')
  const [partRefInput, setPartRefInput] = useState('')
  const [partRefSaving, setPartRefSaving] = useState(false)
  const [partRefSaveMessage, setPartRefSaveMessage] = useState('')
  const [partRefSaveError, setPartRefSaveError] = useState('')
  const [growthPreview, setGrowthPreview] = useState<GrowthPreviewResult | null>(null)
  const [growthPreviewLoading, setGrowthPreviewLoading] = useState(false)
  const [growthPreviewError, setGrowthPreviewError] = useState('')
  const [growthCommitLoading, setGrowthCommitLoading] = useState(false)
  const [growthCommitError, setGrowthCommitError] = useState('')
  const [searchSites, setSearchSites] = useState<SearchSite[]>(DEFAULT_PART_SEARCH_SITES)
  const [temporaryProfiles, setTemporaryProfiles] = useState<TemporaryProfiles>({})
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null)
  const [sitesLoaded, setSitesLoaded] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [newSiteLang, setNewSiteLang] = useState<'ja' | 'en'>('ja')
  const [siteError, setSiteError] = useState('')
  const [openBlockedMessage, setOpenBlockedMessage] = useState('')

  useEffect(() => {
    setKeyword(partName ?? '')
    setActivePartRef(firstPartRef(partRef))
    setSavedPartRefs(partRef ?? '')
    setPartRefInput('')
    setPartRefSaveMessage('')
    setPartRefSaveError('')
    setGrowthPreview(null)
    setGrowthPreviewError('')
    setGrowthPreviewLoading(false)
    setGrowthCommitLoading(false)
    setGrowthCommitError('')
    setTemporaryProfiles({})
    setExpandedSiteId(null)
  }, [
    partName,
    partRef,
    partType,
    watchRef,
    modelName,
    movementMaker,
    movementCaliber,
    baseMovementMaker,
    baseMovementCaliber,
    partsMasterId,
    repairId,
    brandId,
    modelId,
    watchCaliberId,
    standardPartNameId,
    gradeId,
    grade,
    movementMakerId,
    movementCaliberId,
    baseMovementMakerId,
    baseMovementCaliberId,
  ])

  useEffect(() => {
    const panelBackup = readStoredSearchSites(PART_SEARCH_SITES_PANEL_BACKUP_KEY)
    const sharedSites = readStoredSearchSites(PART_SEARCH_SITES_STORAGE_KEY)
    const normalized = panelBackup.length > 0 ? panelBackup : sharedSites
    if (normalized.length > 0) setSearchSites(normalized)
    setSitesLoaded(true)
  }, [])

  useEffect(() => {
    if (!sitesLoaded) return
    persistSearchSites(searchSites)
  }, [searchSites, sitesLoaded])

  const currentDomain = useMemo(
    () => normalizePartSearchDomain(partType, categoryLabel),
    [categoryLabel, partType]
  )

  const searchContext: PartSearchContext = useMemo(() => ({
    brand: brandName,
    watchBrand: brandName,
    watchRef: watchRef || undefined,
    model: modelName,
    caliber: cal,
    movementMaker,
    movementCaliber: movementCaliber || cal,
    baseMovementMaker,
    baseMovementCaliber,
    partType,
    category: categoryLabel,
    partName: keyword || partName,
    partNameEn,
    partRef: activePartRef || undefined,
  }), [activePartRef, baseMovementCaliber, baseMovementMaker, brandName, cal, categoryLabel, keyword, modelName, movementCaliber, movementMaker, partName, partNameEn, partType, watchRef])

  const legacySearchInput = useMemo(() => ({
    brand: partType === 'interior' ? movementMaker || baseMovementMaker || undefined : brandName,
    watchRef: watchRef || modelName,
    caliber: partType === 'interior' ? movementCaliber || baseMovementCaliber || cal : cal,
    partType,
    category: categoryLabel,
    partName: keyword || partName,
    partNameEn,
    partRef: activePartRef || undefined,
  }), [activePartRef, baseMovementCaliber, baseMovementMaker, brandName, cal, categoryLabel, keyword, modelName, movementCaliber, movementMaker, partName, partNameEn, partType, watchRef])

  const japaneseQueries = useMemo(() => buildJapanesePartQueries(legacySearchInput), [legacySearchInput])
  const englishQueries = useMemo(() => buildEnglishPartQueries(legacySearchInput), [legacySearchInput])

  const effectiveSearchSites = useMemo(() => searchSites.map(site => (
    applyProfileToSite(site, currentDomain, getEffectiveProfile(site, currentDomain, temporaryProfiles))
  )), [currentDomain, searchSites, temporaryProfiles])

  const profiledUrls = useMemo(() => buildProfiledSearchUrls({
    sites: effectiveSearchSites,
    context: searchContext,
  }), [effectiveSearchSites, searchContext])

  const profiledUrlBySiteId = useMemo(() => new Map(profiledUrls.map(item => [item.site.id, item])), [profiledUrls])

  const openUrls = (sites: SearchSite[]) => {
    if (disabled) return
    const siteIds = new Set(sites.map(site => site.id))
    const urls = profiledUrls.filter(item => siteIds.has(item.site.id))
    setOpenBlockedMessage('')
    const openedTabs = urls.map(() => window.open('about:blank', '_blank'))
    let blockedCount = 0

    openedTabs.forEach((opened, index) => {
      if (!opened) {
        blockedCount += 1
        return
      }
      opened.opener = null
      opened.location.href = urls[index].url
    })

    if (blockedCount > 0) {
      setOpenBlockedMessage(`${blockedCount}件の検索タブがブラウザにブロックされました。ポップアップ許可後にもう一度お試しください。`)
    }
  }

  const updateSearchSites = (updater: (prev: SearchSite[]) => SearchSite[]) => {
    setSearchSites(prev => {
      const next = normalizeSearchSites(updater(prev))
      persistSearchSites(next)
      return next
    })
  }

  const updateCurrentTemporaryProfile = (site: SearchSite, profile: SearchSiteProfile) => {
    setTemporaryProfiles(prev => updateTemporaryProfile(prev, site.id, currentDomain, {
      ...profile,
      lang: site.lang,
    }))
  }

  const handleSaveDefaultProfile = (site: SearchSite) => {
    const profile = {
      ...getEffectiveProfile(site, currentDomain, temporaryProfiles),
      lang: site.lang,
    }
    updateSearchSites(prev => prev.map(item => (
      item.id === site.id ? applyProfileToSite(item, currentDomain, profile) : item
    )))
    setTemporaryProfiles(prev => removeTemporaryProfile(prev, site.id, currentDomain))
  }

  const handleRestoreStoredProfile = (site: SearchSite) => {
    setTemporaryProfiles(prev => removeTemporaryProfile(prev, site.id, currentDomain))
  }

  const handleSavePartRef = async () => {
    const trimmedPartRef = partRefInput.trim()
    setPartRefSaveMessage('')
    setPartRefSaveError('')

    if (!partsMasterId) {
      setPartRefSaveError('PartsMaster未選択のため部品番号を保存できません')
      return
    }
    if (!trimmedPartRef) {
      setPartRefSaveError('部品番号を入力してください')
      return
    }

    setPartRefSaving(true)
    try {
      const response = await fetch(`/api/parts/${partsMasterId}/search-info`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partRefs: trimmedPartRef }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || '部品番号の保存に失敗しました')

      const addedPartRefs = Array.isArray(data?.addedPartRefs) ? data.addedPartRefs : []
      const skippedPartRefs = Array.isArray(data?.skippedPartRefs) ? data.skippedPartRefs : []
      const nextActivePartRef = addedPartRefs[0] || firstPartRef(trimmedPartRef)
      setSavedPartRefs(data?.part?.partRefs ?? trimmedPartRef)
      setActivePartRef(nextActivePartRef)
      setPartRefInput('')
      setPartRefSaveMessage(formatPartRefSaveMessage(addedPartRefs, skippedPartRefs))
    } catch (error) {
      setPartRefSaveError(error instanceof Error ? error.message : '部品番号の保存に失敗しました')
    } finally {
      setPartRefSaving(false)
    }
  }

  const buildGrowthPayload = (partRefValue: string) => ({
    repairId,
    lineItem: {
      partType,
      category: categoryLabel,
      name: keyword || partName,
      nameJp: keyword || partName,
      nameEn: partNameEn,
      standardPartNameId,
      gradeId,
      grade,
      partRef: partRefValue,
      partRefs: partRefValue,
      partsMasterId,
    },
    context: {
      ...(partType === 'interior' ? {
        movementMakerId,
        movementMakerName: movementMaker,
        movementCaliberId,
        movementCaliberName: movementCaliber,
        baseMovementMakerId,
        baseMovementMakerName: baseMovementMaker,
        baseMovementCaliberId,
        baseMovementCaliberName: baseMovementCaliber,
      } : {
        brandId,
        brandName,
        modelId,
        modelName,
        watchRef,
        caliberId: watchCaliberId,
        caliberName: cal,
      }),
    },
  })

  const handlePreviewPartsMasterGrowth = async () => {
    const trimmedPartRef = partRefInput.trim()
    setGrowthPreview(null)
    setGrowthPreviewError('')
    setGrowthCommitError('')
    setPartRefSaveMessage('')
    setPartRefSaveError('')

    if (!trimmedPartRef && !activePartRef) {
      setGrowthPreviewError('部品番号を入力してください')
      return
    }

    setGrowthPreviewLoading(true)
    try {
      const response = await fetch('/api/parts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGrowthPayload(trimmedPartRef || activePartRef)),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || '候補確認に失敗しました')
      setGrowthPreview(data)
    } catch (error) {
      setGrowthPreviewError(error instanceof Error ? error.message : '候補確認に失敗しました')
    } finally {
      setGrowthPreviewLoading(false)
    }
  }

  const handleCommitPartsMasterGrowth = async (action: 'use-existing' | 'create', selectedPartsMasterId?: number) => {
    const trimmedPartRef = partRefInput.trim()
    const nextPartRef = trimmedPartRef || activePartRef
    setGrowthCommitError('')
    setPartRefSaveMessage('')
    setPartRefSaveError('')

    if (!nextPartRef) {
      setGrowthCommitError('部品番号を入力してください')
      return
    }
    if (action === 'use-existing' && !selectedPartsMasterId) {
      setGrowthCommitError('使用するPartsMasterを選択してください')
      return
    }

    const confirmMessage = action === 'use-existing'
      ? `PartsMaster #${selectedPartsMasterId} をこの明細に反映しますか？`
      : '新規PartsMasterを作成してこの明細に反映しますか？'
    if (!window.confirm(confirmMessage)) return

    setGrowthCommitLoading(true)
    try {
      const response = await fetch('/api/parts/growth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildGrowthPayload(nextPartRef),
          action,
          partsMasterId: selectedPartsMasterId,
        }),
      })
      const data = await response.json().catch(() => null) as GrowthCommitResult | { error?: string } | null
      if (!response.ok) throw new Error(data && 'error' in data ? data.error || 'PartsMaster反映に失敗しました' : 'PartsMaster反映に失敗しました')

      const result = data as GrowthCommitResult
      const nextSavedPartRefs = result.part.partRefs ?? nextPartRef
      setSavedPartRefs(nextSavedPartRefs)
      setActivePartRef(firstPartRef(nextSavedPartRefs))
      setPartRefInput('')
      setPartRefSaveMessage(action === 'create'
        ? `PartsMaster #${result.part.id} を作成しました`
        : formatPartRefSaveMessage(result.addedPartRefs, result.skippedPartRefs)
      )
      onResolvePart?.(toResolvedPartSelection(result))
    } catch (error) {
      setGrowthCommitError(error instanceof Error ? error.message : 'PartsMaster反映に失敗しました')
    } finally {
      setGrowthCommitLoading(false)
    }
  }

  const handleAddSearchSite = () => {
    const name = newSiteName.trim()
    const url = newSiteUrl.trim()
    if (!name || !url) {
      setSiteError('サイト名と検索URLを入力してください')
      return
    }
    if (!url.includes('{query}')) {
      setSiteError('検索URLには {query} を含めてください')
      return
    }

    updateSearchSites(prev => [...prev, {
      id: `site-${Date.now()}`,
      name,
      lang: newSiteLang,
      url,
      enabled: true,
    }])
    setNewSiteName('')
    setNewSiteUrl('')
    setNewSiteLang('ja')
    setSiteError('')
  }

  const handleDeleteSearchSite = (siteId: string) => {
    const target = searchSites.find(site => site.id === siteId)
    if (!target) return
    if (!window.confirm(`「${target.name}」を削除しますか？`)) return
    updateSearchSites(prev => prev.filter(site => site.id !== siteId))
    setTemporaryProfiles(prev => {
      const next = { ...prev }
      delete next[siteId]
      return next
    })
    if (expandedSiteId === siteId) setExpandedSiteId(null)
  }

  const canSavePartRef = Boolean(partsMasterId) && Boolean(partRefInput.trim()) && !partRefSaving && !disabled
  const canPreviewGrowth = Boolean(partRefInput.trim() || activePartRef) && !growthPreviewLoading && !growthCommitLoading && !disabled
  const canCommitGrowth = Boolean(partRefInput.trim() || activePartRef) && !growthCommitLoading && !growthPreviewLoading && !disabled
  const enabledSites = effectiveSearchSites.filter(site => site.enabled)
  const canBulkOpen = profiledUrls.some(item => item.site.enabled)
  const firstJapanese = japaneseQueries.slice(0, 3)
  const firstEnglish = englishQueries.slice(0, 3)
  const currentDomainLabel = currentDomain === 'internal' ? '内装部品' : '外装部品'

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="font-bold text-zinc-700">候補がない場合: Web検索</h4>
        <button
          type="button"
          onClick={() => openUrls(enabledSites)}
          disabled={disabled || !canBulkOpen}
          className="rounded bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:bg-zinc-300"
        >
          選択サイトを一括検索
        </button>
      </div>
      {openBlockedMessage && (
        <div className="mb-3 rounded bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-700">
          {openBlockedMessage}
        </div>
      )}

      <div className="mb-3 grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 font-semibold text-zinc-500">検索対象</div>
          <div className="space-y-0.5 rounded bg-zinc-50 p-2 text-zinc-600">
            <div>対象: {currentDomainLabel}</div>
            {currentDomain === 'internal' ? (
              <>
                <div>ムーブメント: {[movementMaker, movementCaliber || cal].filter(Boolean).join(' ') || '-'}</div>
                <div>ベース: {[baseMovementMaker, baseMovementCaliber].filter(Boolean).join(' ') || '-'}</div>
              </>
            ) : (
              <>
                <div>ブランド: {brandName || '-'}</div>
                <div>Ref/モデル: {watchRef || modelName || '-'}</div>
              </>
            )}
            <div>部品: {partName || '-'}</div>
            <div>部品番号: {savedPartRefs || '-'}</div>
            <div>検索に使用中: {activePartRef || '-'}</div>
          </div>
        </div>
        <div>
          <label className="mb-1 block font-semibold text-zinc-500">部品名の一時上書き</label>
          <input
            className="input-base"
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            disabled={disabled}
            placeholder="部品名として使う検索語"
          />
          <div className="mt-1 text-[10px] text-zinc-400">
            自動生成queryを基本に使います。入力した場合は部品名として扱い、サイト言語別の生成を維持します。
          </div>
        </div>
      </div>

      <div className="mb-3 rounded border border-zinc-200 bg-zinc-50 p-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-zinc-600">部品情報</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {partsMasterId ? `PartsMaster #${partsMasterId}` : 'PartsMaster未選択'} / 現在の部品番号: {savedPartRefs || '未登録'} / 検索に使用中: {activePartRef || '-'}
            </div>
          </div>
          {!partsMasterId && <div className="text-[11px] text-amber-600">PartsMaster未選択のため番号保存はできません。候補確認のみ可能です。</div>}
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <input
            className="input-base"
            value={partRefInput}
            onChange={event => {
              setPartRefInput(event.target.value)
              setPartRefSaveMessage('')
              setPartRefSaveError('')
              setGrowthPreview(null)
              setGrowthPreviewError('')
            }}
            disabled={disabled || partRefSaving || growthPreviewLoading || growthCommitLoading}
            placeholder="判明した部品番号"
          />
          <button
            type="button"
            onClick={handlePreviewPartsMasterGrowth}
            disabled={!canPreviewGrowth}
            className="rounded bg-zinc-800 px-3 py-1.5 font-semibold text-white disabled:bg-zinc-300"
          >
            {growthPreviewLoading ? '確認中...' : '候補確認'}
          </button>
          <button
            type="button"
            onClick={handleSavePartRef}
            disabled={!canSavePartRef}
            className="rounded bg-emerald-600 px-3 py-1.5 font-semibold text-white disabled:bg-zinc-300"
          >
            {partRefSaving ? '保存中...' : '保存'}
          </button>
        </div>
        {partRefSaveMessage && <div className="mt-2 text-[11px] text-emerald-700">{partRefSaveMessage}</div>}
        {partRefSaveError && <div className="mt-2 text-[11px] text-red-600">{partRefSaveError}</div>}
        {growthPreviewError && <div className="mt-2 text-[11px] text-red-600">{growthPreviewError}</div>}
        {growthCommitError && <div className="mt-2 text-[11px] text-red-600">{growthCommitError}</div>}
        {growthPreview && (
          <div className="mt-3 space-y-2 rounded border border-zinc-200 bg-white p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-zinc-600">PartsMaster候補</div>
              <div className="text-[11px] text-zinc-500">
                {growthPreview.strongMatches.length > 0
                  ? '強い一致あり'
                  : growthPreview.similarCandidates.length > 0
                    ? '類似候補あり'
                    : '新規登録候補'}
              </div>
            </div>

            {growthPreview.preview.contextWarnings.length > 0 && (
              <div className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                確認用context不足: {growthPreview.preview.contextWarnings.join(', ')}
              </div>
            )}

            {growthPreview.strongMatches.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold text-zinc-500">既存PartsMasterの強い一致</div>
                <div className="space-y-1">
                  {growthPreview.strongMatches.map(candidate => (
                    <div key={candidate.id} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-zinc-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">#{candidate.id} {candidate.nameJp}</div>
                          <div className="text-[11px] text-zinc-600">
                            Ref: {candidate.partRefs || '-'} / {candidate.reason}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCommitPartsMasterGrowth('use-existing', candidate.id)}
                          disabled={!canCommitGrowth}
                          className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:bg-zinc-300"
                        >
                          {growthCommitLoading ? '反映中...' : 'このPartsMasterを使用'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {growthPreview.similarCandidates.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold text-zinc-500">確認用の類似候補</div>
                <div className="space-y-1">
                  {growthPreview.similarCandidates.map(candidate => (
                    <div key={candidate.id} className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-zinc-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">#{candidate.id} {candidate.nameJp}</div>
                          <div className="text-[11px] text-zinc-600">
                            Ref: {candidate.partRefs || '-'} / {candidate.reason}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCommitPartsMasterGrowth('use-existing', candidate.id)}
                          disabled={!canCommitGrowth}
                          className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white disabled:bg-zinc-300"
                        >
                          {growthCommitLoading ? '反映中...' : 'このPartsMasterを使用'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {growthPreview.strongMatches.length === 0 && (
              <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-zinc-700">
                <div className="font-semibold">新規PartsMaster候補</div>
                <div className="mt-1 text-[11px] text-zinc-600">
                  {formatGrowthPreviewContext(growthPreview.preview)}
                </div>
                {growthPreview.preview.missingRequiredFields.length > 0 && (
                  <div className="mt-1 text-[11px] text-red-600">
                    不足: {growthPreview.preview.missingRequiredFields.join(', ')}
                  </div>
                )}
                {growthPreview.preview.readyForCreate && (
                  <button
                    type="button"
                    onClick={() => handleCommitPartsMasterGrowth('create')}
                    disabled={!canCommitGrowth}
                    className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:bg-zinc-300"
                  >
                    {growthCommitLoading ? '作成中...' : '新規PartsMasterを作成して反映'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 font-semibold text-zinc-500">日本語候補</div>
          <div className="space-y-1 rounded bg-zinc-50 p-2">
            {firstJapanese.length > 0 ? firstJapanese.map(query => (
              <div key={query} className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700">{query}</div>
            )) : <div className="text-zinc-400">候補なし</div>}
          </div>
        </div>
        <div>
          <div className="mb-1 font-semibold text-zinc-500">英語候補</div>
          <div className="space-y-1 rounded bg-zinc-50 p-2">
            {firstEnglish.length > 0 ? firstEnglish.map(query => (
              <div key={query} className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700">{query}</div>
            )) : <div className="text-zinc-400">候補なし</div>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-semibold text-zinc-500">検索サイト</div>
        {effectiveSearchSites.map(site => {
          const storedSite = searchSites.find(item => item.id === site.id) ?? site
          const profile = getEffectiveProfile(storedSite, currentDomain, temporaryProfiles)
          const profileQuery = buildProfiledPartSearchQuery({ site, context: searchContext, profile })
          const profiledUrl = profiledUrlBySiteId.get(site.id)
          const hasQuery = Boolean(profiledUrl?.query)
          const hasTemporaryProfile = Boolean(temporaryProfiles[site.id]?.[currentDomain])
          const missingLabel = missingPartIdentifierLabel(profile, searchContext, site.lang)
          const availableTokens = currentDomain === 'internal' ? INTERNAL_TOKENS : EXTERIOR_TOKENS
          return (
            <div key={site.id} className="rounded border border-zinc-200 px-2 py-1.5">
              <div className="grid gap-2 md:grid-cols-[auto_1fr_auto_auto_auto_auto] md:items-center">
                <label className="flex items-center gap-2 text-zinc-600">
                  <input
                    type="checkbox"
                    checked={site.enabled}
                    onChange={event => updateSearchSites(prev => prev.map(item => (
                      item.id === site.id ? { ...item, enabled: event.target.checked } : item
                    )))}
                    disabled={disabled}
                  />
                  <span className="md:hidden">使用</span>
                </label>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-zinc-700">{site.name}</span>
                    {hasTemporaryProfile && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">一時変更中</span>}
                  </div>
                  <div className="truncate text-[11px] text-zinc-600">{profiledUrl?.query || '検索語なし'}</div>
                  {missingLabel && <div className="text-[10px] text-amber-600">{missingLabel}</div>}
                  <div className="truncate text-[10px] text-zinc-400">{site.url}</div>
                </div>
                <select
                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700"
                  value={site.lang}
                  onChange={event => updateSearchSites(prev => prev.map(item => (
                    item.id === site.id ? { ...item, lang: event.target.value as 'ja' | 'en' } : item
                  )))}
                  disabled={disabled}
                >
                  <option value="ja">JA</option>
                  <option value="en">EN</option>
                </select>
                <button
                  type="button"
                  onClick={() => setExpandedSiteId(expandedSiteId === site.id ? null : site.id)}
                  disabled={disabled}
                  className="rounded bg-zinc-100 px-2 py-1 text-zinc-700 hover:bg-zinc-200 disabled:text-zinc-300"
                >
                  条件変更
                </button>
                <button
                  type="button"
                  onClick={() => openUrls([site])}
                  disabled={disabled || !hasQuery}
                  className="rounded bg-zinc-100 px-2 py-1 text-zinc-700 hover:bg-zinc-200 disabled:text-zinc-300"
                >
                  開く
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSearchSite(site.id)}
                  disabled={disabled}
                  className="rounded bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100 disabled:text-red-200"
                >
                  削除
                </button>
              </div>

              {expandedSiteId === site.id && (
                <div className="mt-2 border-t border-zinc-100 pt-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-zinc-600">{currentDomainLabel}の条件</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestoreStoredProfile(storedSite)}
                        disabled={disabled || !hasTemporaryProfile}
                        className="rounded bg-white px-2 py-1 text-zinc-600 ring-1 ring-zinc-200 disabled:text-zinc-300"
                      >
                        保存済みに戻す
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveDefaultProfile(storedSite)}
                        disabled={disabled || !hasTemporaryProfile}
                        className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white disabled:bg-zinc-300"
                      >
                        このサイトの既定値として保存
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
                    <div>
                      <div className="mb-1 font-semibold text-zinc-500">検索に使用</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {availableTokens.map(token => (
                          <label key={token} className="flex items-center gap-2 rounded bg-zinc-50 px-2 py-1 text-zinc-700">
                            <input
                              type="checkbox"
                              checked={profile.tokens.includes(token)}
                              onChange={event => updateCurrentTemporaryProfile(storedSite, {
                                ...profile,
                                tokens: toggleToken(profile.tokens, token, event.target.checked),
                              })}
                              disabled={disabled}
                            />
                            {TOKEN_LABELS[token]}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 font-semibold text-zinc-500">部品</div>
                      <div className="space-y-1">
                        {PART_IDENTIFIER_MODES.map(mode => (
                          <label key={mode} className="flex items-center gap-2 rounded bg-zinc-50 px-2 py-1 text-zinc-700">
                            <input
                              type="radio"
                              name={`part-mode-${site.id}`}
                              value={mode}
                              checked={profile.partIdentifierMode === mode}
                              onChange={() => updateCurrentTemporaryProfile(storedSite, {
                                ...profile,
                                partIdentifierMode: mode,
                              })}
                              disabled={disabled}
                            />
                            {PART_IDENTIFIER_LABELS[mode]}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 rounded bg-zinc-50 p-2 text-zinc-600">
                    <div className="font-semibold text-zinc-500">生成検索語</div>
                    <div className="mt-1 font-mono text-[11px] text-zinc-800">{profileQuery || missingLabel || '検索語なし'}</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-2">
        <div className="mb-2 font-semibold text-zinc-500">サイト追加</div>
        <div className="grid gap-2 md:grid-cols-[1fr_1.6fr_auto_auto]">
          <input
            className="input-base"
            value={newSiteName}
            onChange={event => setNewSiteName(event.target.value)}
            disabled={disabled}
            placeholder="サイト名"
          />
          <input
            className="input-base"
            value={newSiteUrl}
            onChange={event => setNewSiteUrl(event.target.value)}
            disabled={disabled}
            placeholder="https://example.com/search?q={query}"
          />
          <select
            className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700"
            value={newSiteLang}
            onChange={event => setNewSiteLang(event.target.value as 'ja' | 'en')}
            disabled={disabled}
          >
            <option value="ja">JA</option>
            <option value="en">EN</option>
          </select>
          <button
            type="button"
            onClick={handleAddSearchSite}
            disabled={disabled}
            className="rounded bg-zinc-800 px-3 py-1 font-semibold text-white disabled:bg-zinc-300"
          >
            追加
          </button>
        </div>
        {siteError && <div className="mt-2 text-red-600">{siteError}</div>}
        <div className="mt-2 text-[10px] text-zinc-400">
          サイト設定はこのブラウザの localStorage に保存されます。
        </div>
      </div>
    </div>
  )
}
