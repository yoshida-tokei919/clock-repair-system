'use client'
import { useEffect, useState } from 'react'
import { useAutoRefreshOnReturn } from '@/hooks/use-auto-refresh-on-return'

type OrderRequest = {
  id: number
  status: string
  quantity: number
  partNameJp: string
  partNameEn: string | null
  partRefs: string | null
  cousinsNumber: string | null
  searchWordJp: string | null
  searchWordEn: string | null
  orderedAt: string | null
  receivedAt: string | null
  supplier: { name: string } | null
  repair: { inquiryNumber: string; customer: { name: string } } | null
  partsMaster: {
    nameJp: string
    nameEn: string | null
    partRefs: string | null
    cousinsNumber: string | null
  } | null
}

const SEARCH_SITES = [
  { name: 'Cousins', url: (en: string) => `https://www.cousinsuk.com/search/products?q=${encodeURIComponent(en)}`, lang: 'en' },
  { name: 'eBay', url: (en: string) => `https://www.ebay.com/sch/?_nkw=${encodeURIComponent(en)}`, lang: 'en' },
  { name: 'AliExpress', url: (en: string) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(en)}`, lang: 'en' },
  { name: 'ヤフオク', url: (_: string, jp: string) => `https://auctions.yahoo.co.jp/search?p=${encodeURIComponent(jp)}`, lang: 'jp' },
  { name: 'メルカリ', url: (_: string, jp: string) => `https://www.mercari.com/jp/search/?keyword=${encodeURIComponent(jp)}`, lang: 'jp' },
  { name: '楽天', url: (_: string, jp: string) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(jp)}`, lang: 'jp' },
  { name: 'Yショッピング', url: (_: string, jp: string) => `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(jp)}`, lang: 'jp' },
]

const STATUS_LABEL: Record<string, string> = {
  pending: '未注文',
  ordered: '注文済み',
  received: '入荷済み',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-red-100 text-red-700',
  ordered: 'bg-yellow-100 text-yellow-700',
  received: 'bg-green-100 text-green-700',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRequest[]>([])
  const [loading, setLoading] = useState(true)
  useAutoRefreshOnReturn()

  const fetchOrders = async () => {
    setLoading(true)
    const res = await fetch('/api/orders')
    const data = await res.json()
    setOrders(data)
    setLoading(false)
  }

  useEffect(() => { fetchOrders() }, [])

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    fetchOrders()
  }

  const getSearchWord = (order: OrderRequest) => ({
    jp: order.searchWordJp ?? order.partNameJp,
    en: order.searchWordEn ?? order.partNameEn ?? order.partNameJp,
  })

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">発注管理</h1>
        <span className="text-sm text-gray-500">{orders.length}件</span>
      </div>

      {orders.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          発注待ちの部品はありません
        </div>
      )}

      <div className="space-y-3">
        {orders.map(order => {
          const { jp, en } = getSearchWord(order)
          return (
            <div key={order.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4">
                {/* 左：部品情報 */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                    <span className="font-semibold">{order.partNameJp}</span>
                    {order.partNameEn && (
                      <span className="text-sm text-gray-400">{order.partNameEn}</span>
                    )}
                    <span className="text-sm text-gray-500">× {order.quantity}</span>
                  </div>
                  <div className="text-xs text-gray-500 flex gap-3">
                    {order.partRefs && <span>Ref: {order.partRefs}</span>}
                    {order.cousinsNumber && <span>Cousins#: {order.cousinsNumber}</span>}
                    {order.supplier && <span>仕入先: {order.supplier.name}</span>}
                  </div>
                  {order.repair && (
                    <div className="text-xs text-blue-600">
                      カルテ: {order.repair.inquiryNumber} / {order.repair.customer.name}
                    </div>
                  )}
                  {order.orderedAt && (
                    <div className="text-xs text-gray-400">
                      発注日: {new Date(order.orderedAt).toLocaleDateString('ja-JP')}
                    </div>
                  )}
                </div>

                {/* 右：ボタン */}
                <div className="flex flex-col gap-2 items-end">
                  {/* ステータス更新ボタン */}
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateStatus(order.id, 'ordered')}
                      className="px-4 py-1.5 bg-yellow-500 text-white rounded text-sm font-medium hover:bg-yellow-600 whitespace-nowrap">
                      発注済みにする
                    </button>
                  )}
                  {order.status === 'ordered' && (
                    <button
                      onClick={() => updateStatus(order.id, 'received')}
                      className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 whitespace-nowrap">
                      入荷済みにする
                    </button>
                  )}

                  {/* 検索ボタン */}
                  <div className="flex flex-wrap gap-1 justify-end">
                    {SEARCH_SITES.map(site => (
                      <a key={site.name}
                        href={site.url(en, jp)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 whitespace-nowrap">
                        {site.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
