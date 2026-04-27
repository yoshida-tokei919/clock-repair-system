'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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

type Props = {
  mode: 'standalone' | 'panel'
  onSelect?: (part: {
    id: number
    partsMasterId?: number
    partType?: string
    name: string
    nameJp?: string
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
  }) => void
}

export default function PartsSearchPanel({ mode, onSelect }: Props) {
  const router = useRouter()
  const [partType, setPartType] = useState<'all' | 'interior' | 'exterior'>('all')
  const [keyword, setKeyword] = useState('')
  const [calNumber, setCalNumber] = useState('')
  const [refKeyword, setRefKeyword] = useState('')
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (partType !== 'all') params.set('partType', partType)
    if (keyword) params.set('keyword', keyword)
    if (calNumber) params.set('cal', calNumber)
    if (refKeyword) params.set('ref', refKeyword)
    const res = await fetch(`/api/parts/search?${params.toString()}`)
    const data = await res.json()
    setParts(data)
    setLoading(false)
  }, [partType, keyword, calNumber, refKeyword])

  // 初回全件表示
  useEffect(() => { search() }, [])

  const handleSelect = (part: Part) => {
    if (onSelect) {
      onSelect({
        id: part.id,
        partsMasterId: part.id,
        partType: part.partType ?? undefined,
        name: part.nameJp,
        nameJp: part.nameJp,
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
              onClick={() => setPartType(val)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors
                ${partType === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
              {label}
            </button>
          ))}
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
              <th className="px-3 py-2 text-right">在庫</th>
              <th className="px-3 py-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
            )}
            {!loading && parts.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">該当する部品がありません</td></tr>
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
    </div>
  )
}
