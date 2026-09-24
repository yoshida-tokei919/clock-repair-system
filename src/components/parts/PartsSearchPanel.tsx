'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PartsWebSearchPanel from './PartsWebSearchPanel'

type Part = {
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
  caliber?: { name: string } | null
  baseCaliber?: { name: string } | null
  brand?: { name: string } | null
  supplier?: { name: string } | null
}

type StandardPartCategory = {
  id: string
  key: string
  partType: string
  nameJa: string
  nameEn: string | null
  sortOrder: number
}

type StandardPartName = {
  id: string
  key: string
  partType: string
  categoryId: string
  categoryKey?: string
  nameJa: string
  nameEn: string | null
  displayJa: string | null
  displayEn: string | null
  sortOrder: number
}

type StandardPartGrade = {
  id: string
  key: string
  nameJa: string
  nameEn: string | null
  sortOrder: number
}

type SupplierOption = {
  id: number
  name: string
}

type PartSelection = {
  id: number
  selectedStandardPartNameId?: string | null
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

type MasterData = {
  partCategories: StandardPartCategory[]
  partNames: StandardPartName[]
  partGrades: StandardPartGrade[]
  suppliers: SupplierOption[]
}

type Props = {
  mode: 'standalone' | 'panel'
  initialKeyword?: string
  initialPartType?: 'interior' | 'exterior'
  initialPartRef?: string
  initialPartsMasterId?: number | null
  initialPartNameEn?: string
  initialStandardPartNameId?: string | null
  initialStandardPartNameKey?: string | null
  initialGrade?: string
  targetKey?: string | number
  repairId?: number | null
  brandId?: number | null
  brandName?: string
  modelId?: number | null
  modelName?: string
  watchCaliberId?: number | null
  watchRef?: string
  watchCaliber?: string
  movementMakerId?: number | null
  movementMaker?: string
  movementCaliberId?: number | null
  movementCaliber?: string
  baseMovementMakerId?: number | null
  baseMovementMaker?: string
  baseMovementCaliberId?: number | null
  baseMovementCaliber?: string
  onSelect?: (part: PartSelection) => void
}

function toStandardPartType(value: 'all' | 'interior' | 'exterior') {
  if (value === 'interior') return 'part_internal'
  if (value === 'exterior') return 'part_external'
  return ''
}

export default function PartsSearchPanel({
  mode,
  onSelect,
  initialKeyword = '',
  initialPartType,
  initialPartRef,
  initialPartsMasterId,
  initialPartNameEn,
  initialStandardPartNameId,
  initialStandardPartNameKey,
  initialGrade,
  targetKey,
  repairId,
  brandId,
  brandName,
  modelId,
  modelName,
  watchCaliberId,
  watchRef,
  watchCaliber,
  movementMakerId,
  movementMaker,
  movementCaliberId,
  movementCaliber,
  baseMovementMakerId,
  baseMovementMaker,
  baseMovementCaliberId,
  baseMovementCaliber,
}: Props) {
  const router = useRouter()
  const [partType, setPartType] = useState<'all' | 'interior' | 'exterior'>(initialPartType ?? 'all')
  const [keyword, setKeyword] = useState(initialKeyword)
  const [calNumber, setCalNumber] = useState('')
  const [refKeyword, setRefKeyword] = useState('')
  const [selectedPartCategoryId, setSelectedPartCategoryId] = useState('')
  const [selectedStandardPartNameId, setSelectedStandardPartNameId] = useState('')
  const [selectedGradeId, setSelectedGradeId] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [masterData, setMasterData] = useState<MasterData>({
    partCategories: [],
    partNames: [],
    partGrades: [],
    suppliers: [],
  })
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(false)
  const resolvedTargetKey = targetKey ?? '__standalone__'
  const lastTargetKeyRef = useRef(resolvedTargetKey)
  const searchRequestSeqRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function loadMasterData() {
      try {
        const res = await fetch('/api/master-data')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setMasterData({
          partCategories: Array.isArray(data.partCategories) ? data.partCategories : [],
          partNames: Array.isArray(data.partNames) ? data.partNames : [],
          partGrades: Array.isArray(data.partGrades) ? data.partGrades : [],
          suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
        })
      } catch {
        // Keep legacy search usable even if master data cannot be loaded.
      }
    }

    loadMasterData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (lastTargetKeyRef.current === resolvedTargetKey) return
    lastTargetKeyRef.current = resolvedTargetKey
    searchRequestSeqRef.current += 1
    setLoading(false)
    setParts([])
    setPartType(initialPartType ?? 'all')
    setKeyword(initialKeyword)
    setCalNumber('')
    setRefKeyword('')
    setSelectedPartCategoryId('')
    setSelectedStandardPartNameId('')
    setSelectedGradeId('')
    setSelectedSupplierId('')
  }, [initialKeyword, initialPartType, resolvedTargetKey])

  const search = useCallback(async () => {
    const requestSeq = searchRequestSeqRef.current + 1
    searchRequestSeqRef.current = requestSeq
    setLoading(true)
    const params = new URLSearchParams()
    if (partType !== 'all') params.set('partType', partType)
    if (keyword) params.set('keyword', keyword)
    if (calNumber) params.set('cal', calNumber)
    if (refKeyword) params.set('ref', refKeyword)
    const res = await fetch(`/api/parts/search?${params.toString()}`)
    const data = await res.json()
    if (searchRequestSeqRef.current !== requestSeq) return
    setParts(data)
    setLoading(false)
  }, [partType, keyword, calNumber, refKeyword])

  // 初回全件表示
  useEffect(() => { search() }, [])

  const standardPartType = toStandardPartType(partType)
  const filteredPartCategories = masterData.partCategories.filter(category =>
    !standardPartType || category.partType === standardPartType
  )
  const filteredPartNames = masterData.partNames.filter(partName =>
    (!standardPartType || partName.partType === standardPartType) &&
    (!selectedPartCategoryId || partName.categoryId === selectedPartCategoryId)
  )
  const selectedStandardPartName = masterData.partNames.find(partName => partName.id === selectedStandardPartNameId)
  const initialStandardPartName = masterData.partNames.find(partName =>
    (initialStandardPartNameId && partName.id === initialStandardPartNameId) ||
    (initialStandardPartNameKey && partName.key === initialStandardPartNameKey)
  )
  const selectedGrade = masterData.partGrades.find(grade => grade.id === selectedGradeId)

  const handlePartTypeChange = (nextPartType: 'all' | 'interior' | 'exterior') => {
    setPartType(nextPartType)
    setSelectedPartCategoryId('')
    setSelectedStandardPartNameId('')
  }

  const handleSelect = (part: Part) => {
    if (onSelect) {
      onSelect({
        id: part.id,
        selectedStandardPartNameId: selectedStandardPartNameId || initialStandardPartName?.id || initialStandardPartNameId || null,
        partsMasterId: part.id,
        partType: part.partType ?? undefined,
        name: part.nameJp,
        nameJp: part.nameJp,
        nameEn: part.nameEn,
        grade: part.grade ?? '',
        note1: part.notes1 ?? '',
        note2: part.notes2 ?? '',
        partRef: part.partRefs ?? '',
        partRefs: part.partRefs ?? '',
        cousinsNumber: part.cousinsNumber ?? '',
        price: part.retailPrice,
        retailPrice: part.retailPrice,
        cost: part.latestCostYen,
        latestCostYen: part.latestCostYen,
        stockQuantity: part.stockQuantity ?? 0,
        supplierName: part.supplier?.name ?? '',
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* 検索フォーム */}
      <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
        {/* 区分タブ */}
        <div className="flex gap-2">
          {([['all','すべて'],['interior','内装'],['exterior','外装']] as const).map(([val, label]) => (
            <button key={val}
              onClick={() => handlePartTypeChange(val)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors
                ${partType === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="label-sm">標準カテゴリ</label>
            <select
              className="input-base"
              value={selectedPartCategoryId}
              onChange={event => {
                setSelectedPartCategoryId(event.target.value)
                setSelectedStandardPartNameId('')
              }}
            >
              <option value="">すべて</option>
              {filteredPartCategories.map(category => (
                <option key={category.id} value={category.id}>{category.nameJa}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-sm">標準部品名</label>
            <select
              className="input-base"
              value={selectedStandardPartNameId}
              onChange={event => setSelectedStandardPartNameId(event.target.value)}
            >
              <option value="">すべて</option>
              {filteredPartNames.map(partName => (
                <option key={partName.id} value={partName.id}>
                  {partName.displayJa ?? partName.nameJa}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-sm">グレード</label>
            <select
              className="input-base"
              value={selectedGradeId}
              onChange={event => setSelectedGradeId(event.target.value)}
            >
              <option value="">すべて</option>
              {masterData.partGrades.map(grade => (
                <option key={grade.id} value={grade.id}>{grade.nameJa}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-sm">仕入先</label>
            <select
              className="input-base"
              value={selectedSupplierId}
              onChange={event => setSelectedSupplierId(event.target.value)}
            >
              <option value="">すべて</option>
              {masterData.suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* キーワード検索（常時表示） */}
          <div>
            <label className="label-sm">部品名 / 部品Ref</label>
            <input className="input-base" placeholder="例: ゼンマイ, B-100"
              value={keyword} onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()} />
          </div>

          {/* 内装：Cal.検索 */}
          {partType !== 'exterior' && (
            <div>
              <label className="label-sm">Cal.（ベースCal.含む）</label>
              <input className="input-base" placeholder="例: 3135"
                value={calNumber} onChange={e => setCalNumber(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()} />
            </div>
          )}

          {/* 外装：Ref検索 */}
          {partType !== 'interior' && (
            <div>
              <label className="label-sm">Ref / モデル</label>
              <input className="input-base" placeholder="例: 116610LN"
                value={refKeyword} onChange={e => setRefKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()} />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={search}
            className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold">
            🔍 検索
          </button>
        </div>
      </div>

      {/* 検索結果 */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">区分</th>
              <th className="px-3 py-2 text-left">部品名</th>
              <th className="px-3 py-2 text-left">Cal. / Ref</th>
              <th className="px-3 py-2 text-left">グレード</th>
              <th className="px-3 py-2 text-right">上代</th>
              <th className="px-3 py-2 text-right">仕入</th>
              <th className="px-3 py-2 text-right">在庫</th>
              <th className="px-3 py-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
            )}
            {!loading && parts.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">該当する部品がありません</td></tr>
            )}
            {!loading && parts.map(part => (
              <tr key={part.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${part.partType === 'interior' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {part.partType === 'interior' ? '内装' : '外装'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{part.nameJp}</div>
                  {part.nameEn && <div className="text-xs text-gray-400">{part.nameEn}</div>}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {part.partType === 'interior'
                    ? [part.caliber?.name, part.baseCaliber?.name].filter(Boolean).join(' / ')
                    : part.partRefs ?? ''}
                </td>
                <td className="px-3 py-2">{part.grade ?? '-'}</td>
                <td className="px-3 py-2 text-right font-mono">
                  ¥{part.retailPrice.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  ¥{part.latestCostYen.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={part.stockQuantity === 0 ? 'text-red-500 font-bold' : ''}>
                    {part.stockQuantity}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex gap-2 justify-center">
                    {mode === 'panel' && (
                      <button onClick={() => handleSelect(part)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">
                        選択
                      </button>
                    )}
                    {mode === 'standalone' && (
                      <button onClick={() => router.push(`/parts/${part.id}/edit`)}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300">
                        編集
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PartsWebSearchPanel
        repairId={repairId}
        brandId={brandId}
        brandName={brandName}
        modelId={modelId}
        modelName={modelName}
        watchCaliberId={watchCaliberId}
        watchRef={refKeyword || watchRef}
        cal={calNumber || watchCaliber}
        movementMakerId={movementMakerId}
        movementMaker={movementMaker}
        movementCaliberId={movementCaliberId}
        movementCaliber={movementCaliber}
        baseMovementMakerId={baseMovementMakerId}
        baseMovementMaker={baseMovementMaker}
        baseMovementCaliberId={baseMovementCaliberId}
        baseMovementCaliber={baseMovementCaliber}
        partType={partType === 'all' ? initialPartType : partType}
        partName={keyword || selectedStandardPartName?.displayJa || selectedStandardPartName?.nameJa || initialKeyword}
        partNameEn={selectedStandardPartName?.displayEn || selectedStandardPartName?.nameEn || initialPartNameEn}
        standardPartNameId={selectedStandardPartNameId || initialStandardPartName?.id || initialStandardPartNameId}
        partRef={initialPartRef}
        gradeId={selectedGradeId || null}
        grade={selectedGrade?.nameJa || initialGrade}
        partsMasterId={initialPartsMasterId}
        disabled={loading}
        onResolvePart={part => onSelect?.({
          ...part,
          selectedStandardPartNameId: selectedStandardPartNameId || initialStandardPartName?.id || initialStandardPartNameId || null,
        })}
      />
    </div>
  )
}
