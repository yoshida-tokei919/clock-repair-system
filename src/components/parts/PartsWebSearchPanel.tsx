'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PART_SEARCH_SITES,
  buildEnglishPartQueries,
  buildJapanesePartQueries,
  buildSearchUrls,
  type SearchSite,
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

const PART_SEARCH_SITES_STORAGE_KEY = 'repair-part-search-sites:v1'
const PART_SEARCH_SITES_PANEL_BACKUP_KEY = 'repair-part-search-sites:v1:parts-panel'

function normalizeSearchSites(value: unknown): SearchSite[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((site): site is SearchSite =>
      site
      && typeof site.id === 'string'
      && typeof site.name === 'string'
      && (site.lang === 'ja' || site.lang === 'en')
      && typeof site.url === 'string'
    )
    .map(site => ({
      ...site,
      enabled: site.enabled !== false,
    }))
}

function readStoredSearchSites(key: string) {
  if (typeof window === 'undefined') return []
  try {
    const saved = window.localStorage.getItem(key)
    return normalizeSearchSites(saved ? JSON.parse(saved) : null)
  } catch {
    return []
  }
}

function persistSearchSites(sites: SearchSite[]) {
  if (typeof window === 'undefined') return
  const serialized = JSON.stringify(sites)
  window.localStorage.setItem(PART_SEARCH_SITES_STORAGE_KEY, serialized)
  window.localStorage.setItem(PART_SEARCH_SITES_PANEL_BACKUP_KEY, serialized)
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
  const [searchSites, setSearchSites] = useState<SearchSite[]>(DEFAULT_PART_SEARCH_SITES)
  const [sitesLoaded, setSitesLoaded] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [newSiteLang, setNewSiteLang] = useState<'ja' | 'en'>('ja')
  const [siteError, setSiteError] = useState('')

  useEffect(() => {
    const panelBackup = readStoredSearchSites(PART_SEARCH_SITES_PANEL_BACKUP_KEY)
    const sharedSites = readStoredSearchSites(PART_SEARCH_SITES_STORAGE_KEY)
    const normalized = panelBackup.length > 0 ? panelBackup : sharedSites
    if (normalized.length > 0) {
      setSearchSites(normalized)
    }
    setSitesLoaded(true)
  }, [])

  useEffect(() => {
    if (!sitesLoaded) return
    persistSearchSites(searchSites)
  }, [searchSites, sitesLoaded])

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

  const keywordQuery = keyword.trim()
  const searchJapaneseQueries = keywordQuery
    ? [keywordQuery, ...japaneseQueries.filter(query => query !== keywordQuery)]
    : japaneseQueries
  const searchEnglishQueries = keywordQuery
    ? [keywordQuery, ...englishQueries.filter(query => query !== keywordQuery)]
    : englishQueries

  const openUrls = (sites: SearchSite[]) => {
    if (disabled) return
    const urls = buildSearchUrls({
      sites,
      japaneseQueries: searchJapaneseQueries,
      englishQueries: searchEnglishQueries,
    })
    urls.forEach(({ url }) => {
      const opened = window.open(url, '_blank')
      if (opened) {
        opened.opener = null
      }
    })
  }

  const updateSearchSites = (updater: (prev: SearchSite[]) => SearchSite[]) => {
    setSearchSites(prev => {
      const next = updater(prev)
      persistSearchSites(next)
      return next
    })
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
  }

  const enabledSites = searchSites.filter(site => site.enabled)
  const canBulkOpen = buildSearchUrls({
    sites: enabledSites,
    japaneseQueries: searchJapaneseQueries,
    englishQueries: searchEnglishQueries,
  }).length > 0
  const firstJapanese = japaneseQueries.slice(0, 3)
  const firstEnglish = englishQueries.slice(0, 3)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="font-bold text-zinc-700">候補にない場合（Web検索）</h4>
        <button
          type="button"
          onClick={() => openUrls(enabledSites)}
          disabled={disabled || !canBulkOpen}
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

      <div className="space-y-2">
        <div className="font-semibold text-zinc-500">検索サイト</div>
        {searchSites.map(site => {
          const hasQuery = buildSearchUrls({
            sites: [site],
            japaneseQueries: searchJapaneseQueries,
            englishQueries: searchEnglishQueries,
          }).length > 0
          return (
            <div key={site.id} className="grid gap-2 rounded border border-zinc-200 px-2 py-1.5 md:grid-cols-[auto_1fr_auto_auto_auto] md:items-center">
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
                <div className="truncate font-medium text-zinc-700">{site.name}</div>
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
