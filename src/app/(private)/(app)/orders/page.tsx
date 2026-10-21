'use client'
import { useEffect, useState } from 'react'
import { useAutoRefreshOnReturn } from '@/hooks/use-auto-refresh-on-return'
import { WorkTimerStartButton } from '@/components/work-time/WorkTimerStartButton'

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
  procurementShippingMethodId: number | null
  expectedArrivalDate: string | null
  procurementShippingMethod: { id: number; name: string; carrierName: string | null; manualTransitLeadDays: number | null; isActive: boolean } | null
  supplier: { name: string } | null
  repair: { id: number; inquiryNumber: string; customer: { name: string } } | null
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
  pending: '発注リスト追加済み',
  ordered: '注文済み',
  received: '入荷済み',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  ordered: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRequest[]>([])
  const [shippingMethods, setShippingMethods] = useState<Array<{ id: number; name: string; isActive: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [filteredOutIds, setFilteredOutIds] = useState<number[]>([])
  useAutoRefreshOnReturn()

  const fetchOrders = async () => {
    setLoading(true)
    const res = await fetch('/api/orders')
    const data = await res.json()
    setOrders(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
    fetch('/api/settings/procurement').then(async res => {
      if (!res.ok) throw new Error('配送方法を読み込めませんでした。')
      return res.json()
    }).then(data => setShippingMethods(data.shippingMethods)).catch(err => setError(err.message))
  }, [])

  const updateOrder = async (id: number, body: { status?: string; procurementShippingMethodId?: number | null }) => {
    setError(null)
    setSavingId(id)
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '発注を更新できませんでした。')
      }
      await fetchOrders()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '発注を更新できませんでした。')
      return false
    } finally {
      setSavingId(null)
    }
  }

  const updateStatus = async (order: OrderRequest, status: string) => {
    await updateOrder(order.id, status === 'ordered'
      ? { status, procurementShippingMethodId: order.procurementShippingMethodId }
      : { status })
  }

  const handleAssignToRepair = async (id: number) => {
    if (await updateOrder(id, { status: 'assigned' }))
      setFilteredOutIds(prev => prev.includes(id) ? prev : [...prev, id])
  }

  const getSearchWord = (order: OrderRequest) => ({
    jp: order.searchWordJp ?? order.partNameJp,
    en: order.searchWordEn ?? order.partNameEn ?? order.partNameJp,
  })

  const visibleOrders = orders.filter(order => !filteredOutIds.includes(order.id))

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">発注管理</h1>
        <span className="text-sm text-gray-500">{visibleOrders.length}件</span>
      </div>
      {error && <div role="alert" className="mb-4 text-sm text-red-700">{error}</div>}

      {visibleOrders.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          表示中の部品はありません
        </div>
      )}

      <div className="space-y-3">
        {visibleOrders.map(order => {
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
                  <div className="text-xs text-gray-600">
                    入荷予定日: {order.expectedArrivalDate ? order.expectedArrivalDate.slice(0, 10).replace(/-/g, '/') : '未算出'}
                  </div>
                  {(order.status === 'pending' || order.status === 'ordered') ? (
                    <label className="block text-xs text-gray-600">
                      調達配送方法
                      <select
                        aria-label={`${order.partNameJp}の調達配送方法`}
                        className="ml-2 rounded border px-2 py-1 text-sm text-gray-800"
                        value={order.procurementShippingMethodId ?? ''}
                        disabled={savingId === order.id}
                        onChange={event => updateOrder(order.id, { procurementShippingMethodId: event.target.value ? Number(event.target.value) : null })}
                      >
                        <option value="">未選択</option>
                        {shippingMethods.filter(method => method.isActive || method.id === order.procurementShippingMethodId).map(method => (
                          <option key={method.id} value={method.id}>{method.name}{method.isActive ? '' : '（無効）'}</option>
                        ))}
                        {order.procurementShippingMethod && !shippingMethods.some(method => method.id === order.procurementShippingMethodId) && (
                          <option value={order.procurementShippingMethod.id}>{order.procurementShippingMethod.name}（無効）</option>
                        )}
                      </select>
                    </label>
                  ) : order.procurementShippingMethod && (
                    <div className="text-xs text-gray-600">調達配送方法: {order.procurementShippingMethod.name}</div>
                  )}
                  {order.receivedAt && (
                    <div className="text-xs text-green-600">
                      入荷日: {new Date(order.receivedAt).toLocaleDateString('ja-JP')}
                    </div>
                  )}
                </div>

                {/* 右：ボタン */}
                <div className="flex flex-col gap-2 items-end">
                  <WorkTimerStartButton input={{ activityType: 'PARTS_ORDER', orderRequestId: order.id, ...(order.repair ? { repairId: order.repair.id } : {}), label: order.partNameJp.slice(0, 200) }}>
                    発注作業開始
                  </WorkTimerStartButton>
                  {/* ステータス更新ボタン */}
                  {order.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => updateStatus(order, 'ordered')}
                      disabled={savingId === order.id}
                      className="px-4 py-1.5 bg-yellow-500 text-white rounded text-sm font-medium hover:bg-yellow-600 whitespace-nowrap">
                      発注済みにする
                    </button>
                  )}
                  {order.status === 'ordered' && (
                    <button
                      type="button"
                      onClick={() => updateStatus(order, 'received')}
                      disabled={savingId === order.id}
                      className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 whitespace-nowrap">
                      入荷済みにする
                    </button>
                  )}
                  {order.status === 'received' && (
                    <button
                      type="button"
                      onClick={() => handleAssignToRepair(order.id)}
                      disabled={savingId === order.id}
                      className="px-4 py-1.5 bg-white text-green-700 border border-green-300 rounded text-sm font-medium hover:bg-green-50 whitespace-nowrap">
                      案件へ割当
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
