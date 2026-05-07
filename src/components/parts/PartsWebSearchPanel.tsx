'use client'

import { useMemo, useState } from 'react'
import {
  DEFAULT_PART_SEARCH_SITES,
  buildEnglishPartQueries,
  buildJapanesePartQueries,
  buildSearchUrls,
} from '@/lib/part-search'

type Props = {
  brandName?: string
  modelName?: string
  watchRef?: string
  cal?: string
  partType?: 'interior' | 'exterior'
  categoryLabel?: string
  partName?: string
  partNameEn?: string
  disabled?: boolean
}

export default function PartsWebSearchPanel({
  brandName,
  modelName,
  watchRef,
  cal,
  partType,
  categoryLabel,
  partName,
  partNameEn,
  disabled = false,
}: Props) {
  const [keyword, setKeyword] = useState(partName ?? '')

  const searchInput = useMemo(() => ({
    brand: brandName,
    watchRef: watchRef || modelName,
    caliber: cal,
    partType,
    category: categoryLabel,
    partName: keyword || partName,
  }), [brandName, cal, categoryLabel, keyword, modelName, partName, partType, watchRef])

  const japaneseQueries = useMemo(
    () => buildJapanesePartQueries(searchInput),
    [searchInput]
  )
  const englishQueries = useMemo(() => {
    const generated = buildEnglishPartQueries(searchInput)
    if (generated.length > 0 || !partNameEn) return generated
    return [partNameEn].filter(Boolean)
  }, [partNameEn, searchInput])

  const openUrls = (sites = DEFAULT_PART_SEARCH_SITES.filter(site => site.enabled)) => {
    if (disabled) return
    buildSearchUrls({ sites, japaneseQueries, englishQueries }).forEach(({ url }) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  }

  const firstJapanese = japaneseQueries.slice(0, 3)
  const firstEnglish = englishQueries.slice(0, 3)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="font-bold text-zinc-700">候補にない場合（Web検索）</h4>
        <button
          type="button"
          onClick={() => openUrls()}
          disabled={disabled || (japaneseQueries.length === 0 && englishQueries.length === 0)}
          className="rounded bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:bg-zinc-300"
        >
          選択サイトを一括検索
        </button>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 font-semibold text-zinc-500">検索条件</div>
          <div className="space-y-0.5 rounded bg-zinc-50 p-2 text-zinc-600">
            <div>ブランド: {brandName || '-'}</div>
            <div>Ref/モデル: {watchRef || modelName || '-'}</div>
            <div>Cal: {cal || '-'}</div>
            <div>部品: {partName || '-'}</div>
          </div>
        </div>
        <div>
          <label className="mb-1 block font-semibold text-zinc-500">検索キーワード</label>
          <input
            className="input-base"
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            disabled={disabled}
            placeholder="検索キーワードを編集..."
          />
        </div>
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

      <div className="space-y-1">
        <div className="font-semibold text-zinc-500">検索サイト</div>
        {DEFAULT_PART_SEARCH_SITES.map(site => {
          const hasQuery = site.lang === 'ja' ? japaneseQueries.length > 0 : englishQueries.length > 0
          return (
            <div key={site.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-2 py-1.5">
              <div className="min-w-0">
                <span className="font-medium text-zinc-700">{site.name}</span>
                <span className="ml-2 rounded border border-zinc-200 px-1 text-[10px] text-zinc-500">{site.lang.toUpperCase()}</span>
              </div>
              <button
                type="button"
                onClick={() => openUrls([site])}
                disabled={disabled || !hasQuery}
                className="rounded bg-zinc-100 px-2 py-1 text-zinc-700 hover:bg-zinc-200 disabled:text-zinc-300"
              >
                開く
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
