'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type MasterData = {
  brands: { id: number; name: string }[]
  models: { id: number; name: string }[]
  calibers: { id: number; name: string }[]
  suppliers: { id: number; name: string }[]
}

type FormData = {
  partType: string
  category: string
  subcategory: string
  // 外装
  brandId: string
  modelId: string
  watchRefs: string
  // 内装
  caliberId: string
  baseCaliberId: string
  movementMakerId: string
  baseMakerId: string
  // 部品情報
  nameJp: string
  nameEn: string
  partRefs: string
  cousinsNumber: string
  grade: string
  size: string
  photoKey: string
  notes1: string
  notes2: string
  // 価格
  costCurrency: string
  costOriginal: string
  latestCostYen: string
  markupRate: string
  retailPrice: string
  // 在庫
  stockQuantity: string
  minStockAlert: string
  minStockAlertEnabled: boolean
  location: string
  supplierId: string
}

const INITIAL: FormData = {
  partType: 'interior',
  category: 'internal',
  subcategory: '',
  brandId: '', modelId: '', watchRefs: '',
  caliberId: '', baseCaliberId: '', movementMakerId: '', baseMakerId: '',
  nameJp: '', nameEn: '', partRefs: '', cousinsNumber: '',
  grade: '純正', size: '', photoKey: '', notes1: '', notes2: '',
  costCurrency: 'JPY', costOriginal: '0', latestCostYen: '0',
  markupRate: '1.3', retailPrice: '0',
  stockQuantity: '0', minStockAlert: '0', minStockAlertEnabled: false,
  location: '', supplierId: '',
}

// 上代計算：下代×掛け率→500円単位切り上げ
function calcRetail(costYen: number, rate: number): number {
  const raw = costYen * rate
  return Math.ceil(raw / 500) * 500
}

// 自由入力＋追加ボタンの共通コンポーネント
function InlineAdd({
  value, onChange, onAdd, placeholder, disabled
}: {
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className="flex gap-1 mt-1">
      <input
        className="input-base flex-1 text-xs"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '新規入力...'}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || !value.trim()}
        className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shrink-0"
      >
        ＋追加
      </button>
    </div>
  )
}

export default function PartsForm({ partId }: { partId?: number }) {
  const router = useRouter()
  const [form, setForm] = useState<FormData>(INITIAL)
  const [master, setMaster] = useState<MasterData>({ brands: [], models: [], calibers: [], suppliers: [] })
  const [saving, setSaving] = useState(false)
  const [rates, setRates] = useState<Record<string, number>>({ JPY: 1, GBP: 1, USD: 1, EUR: 1 })
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string>('')

  // 自由入力フィールドの状態
  const [newBrand, setNewBrand] = useState('')
  const [newModel, setNewModel] = useState('')
  const [newCal, setNewCal] = useState('')
  const [newBaseCal, setNewBaseCal] = useState('')
  const [newMovMaker, setNewMovMaker] = useState('')
  const [newBaseMaker, setNewBaseMaker] = useState('')

  // マスターデータ取得
  const refreshMaster = async () => {
    const data = await fetch('/api/master-data').then(r => r.json())
    setMaster(data)
  }

  useEffect(() => {
    refreshMaster()
    fetch('/api/exchange-rate').then(r => r.json()).then(d => {
      setRates({ JPY: 1, GBP: d.GBP, USD: d.USD, EUR: d.EUR })
      setRateUpdatedAt(d.updatedAt)
    })
  }, [])

  // 編集時：既存データ取得
  useEffect(() => {
    if (!partId) return
    fetch(`/api/parts/${partId}`).then(r => r.json()).then((d) => {
      setForm({
        partType: d.partType ?? 'interior',
        category: d.category ?? 'internal',
        subcategory: d.subcategory ?? '',
        brandId: d.brandId?.toString() ?? '',
        modelId: d.modelId?.toString() ?? '',
        watchRefs: d.watchRefs ?? '',
        caliberId: d.caliberId?.toString() ?? '',
        baseCaliberId: d.baseCaliberId?.toString() ?? '',
        movementMakerId: d.movementMakerId?.toString() ?? '',
        baseMakerId: d.baseMakerId?.toString() ?? '',
        nameJp: d.nameJp ?? '',
        nameEn: d.nameEn ?? '',
        partRefs: d.partRefs ?? '',
        cousinsNumber: d.cousinsNumber ?? '',
        grade: d.grade ?? '純正',
        size: d.size ?? '',
        photoKey: d.photoKey ?? '',
        notes1: d.notes1 ?? '',
        notes2: d.notes2 ?? '',
        costCurrency: d.costCurrency ?? 'JPY',
        costOriginal: d.costOriginal?.toString() ?? '0',
        latestCostYen: d.latestCostYen?.toString() ?? '0',
        markupRate: d.markupRate?.toString() ?? '1.3',
        retailPrice: d.retailPrice?.toString() ?? '0',
        stockQuantity: d.stockQuantity?.toString() ?? '0',
        minStockAlert: d.minStockAlert?.toString() ?? '0',
        minStockAlertEnabled: d.minStockAlertEnabled ?? false,
        location: d.location ?? '',
        supplierId: d.supplierId?.toString() ?? '',
      })
    })
  }, [partId])

  // 外貨→円換算
  useEffect(() => {
    if (form.costCurrency === 'JPY') return
    const rate = rates[form.costCurrency] ?? 1
    const yen = Math.round((parseFloat(form.costOriginal) || 0) * rate)
    setForm(f => ({ ...f, latestCostYen: yen.toString() }))
  }, [form.costOriginal, form.costCurrency, rates])

  // 上代リアルタイム計算
  useEffect(() => {
    const cost = parseInt(form.latestCostYen) || 0
    const rate = parseFloat(form.markupRate) || 1.3
    setForm(f => ({ ...f, retailPrice: calcRetail(cost, rate).toString() }))
  }, [form.latestCostYen, form.markupRate])

  const set = (key: keyof FormData, val: string | boolean) =>
    setForm(f => ({ ...f, [key]: val }))

  const addMaster = async (payload: { type: 'brand' | 'model' | 'caliber'; name: string; brandId?: number }) => {
    const res = await fetch('/api/master-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      throw new Error(await res.text())
    }
    return await res.json()
  }

  // ブランド追加
  const handleAddBrand = async () => {
    const name = newBrand.trim()
    if (!name) return
    try {
      const b = await addMaster({ type: 'brand', name })
      await refreshMaster()
      set('brandId', String(b.id))
      setNewBrand('')
    } catch (error) {
      console.error('Failed to add brand:', error)
      alert('追加に失敗しました')
    }
  }

  // モデル追加（ブランド選択必須）
  const handleAddModel = async () => {
    const name = newModel.trim()
    if (!name) return
    const brandId = parseInt(form.brandId)
    if (!brandId) return
    try {
      const m = await addMaster({ type: 'model', name, brandId })
      await refreshMaster()
      set('modelId', String(m.id))
      setNewModel('')
    } catch (error) {
      console.error('Failed to add model:', error)
      alert('追加に失敗しました')
    }
  }

  // Cal. 追加
  const handleAddCal = async () => {
    const name = newCal.trim()
    if (!name) return
    try {
      const c = await addMaster({ type: 'caliber', name })
      await refreshMaster()
      set('caliberId', String(c.id))
      setNewCal('')
    } catch (error) {
      console.error('Failed to add caliber:', error)
      alert('追加に失敗しました')
    }
  }

  // ベースCal. 追加
  const handleAddBaseCal = async () => {
    const name = newBaseCal.trim()
    if (!name) return
    try {
      const c = await addMaster({ type: 'caliber', name })
      await refreshMaster()
      set('baseCaliberId', String(c.id))
      setNewBaseCal('')
    } catch (error) {
      console.error('Failed to add base caliber:', error)
      alert('追加に失敗しました')
    }
  }

  // ムーブメント製造元追加（Brand）
  const handleAddMovMaker = async () => {
    const name = newMovMaker.trim()
    if (!name) return
    try {
      const b = await addMaster({ type: 'brand', name })
      await refreshMaster()
      set('movementMakerId', String(b.id))
      setNewMovMaker('')
    } catch (error) {
      console.error('Failed to add movement maker:', error)
      alert('追加に失敗しました')
    }
  }

  // ベースムーブメント製造元追加（Brand）
  const handleAddBaseMaker = async () => {
    const name = newBaseMaker.trim()
    if (!name) return
    try {
      const b = await addMaster({ type: 'brand', name })
      await refreshMaster()
      set('baseMakerId', String(b.id))
      setNewBaseMaker('')
    } catch (error) {
      console.error('Failed to add base maker:', error)
      alert('追加に失敗しました')
    }
  }

  const handleSubmit = async () => {
    setSaving(true)
    const payload = {
      ...form,
      partType: form.partType || null,
      brandId: form.brandId ? parseInt(form.brandId) : null,
      modelId: form.modelId ? parseInt(form.modelId) : null,
      caliberId: form.caliberId ? parseInt(form.caliberId) : null,
      baseCaliberId: form.baseCaliberId ? parseInt(form.baseCaliberId) : null,
      movementMakerId: form.movementMakerId ? parseInt(form.movementMakerId) : null,
      baseMakerId: form.baseMakerId ? parseInt(form.baseMakerId) : null,
      supplierId: form.supplierId ? parseInt(form.supplierId) : null,
      costOriginal: parseFloat(form.costOriginal) || 0,
      latestCostYen: parseInt(form.latestCostYen) || 0,
      markupRate: parseFloat(form.markupRate) || 1.3,
      retailPrice: parseInt(form.retailPrice) || 0,
      stockQuantity: parseInt(form.stockQuantity) || 0,
      minStockAlert: parseInt(form.minStockAlert) || 0,
      name: form.nameJp, // Legacyフィールド
    }
    const url = partId ? `/api/parts/${partId}` : '/api/parts'
    const method = partId ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    router.push('/parts')
  }

  const isInterior = form.partType === 'interior'

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-xl font-bold">{partId ? '部品マスタ編集' : '部品マスタ新規登録'}</h1>

      {/* 区分選択 */}
      <section className="space-y-3">
        <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">区分</h2>
        <div className="flex gap-4">
          {(['interior', 'exterior'] as const).map(t => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="partType" value={t}
                checked={form.partType === t}
                onChange={() => set('partType', t)} />
              <span>{t === 'interior' ? '内装（ムーブメント）' : '外装（ケース・ベルト等）'}</span>
            </label>
          ))}
        </div>
      </section>

      {/* 内装：ムーブメント情報 */}
      {isInterior && (
        <section className="space-y-3 border rounded-lg p-4 bg-blue-50">
          <h2 className="font-semibold text-sm text-blue-700">ムーブメント情報</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">サブカテゴリ</label>
              <select className="input-base" value={form.subcategory} onChange={e => set('subcategory', e.target.value)}>
                <option value="">選択してください</option>
                {['地板/受け','輪列','巻上','調速','裏まわり'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label-sm">Cal.（キャリバー）</label>
              <select className="input-base" value={form.caliberId} onChange={e => set('caliberId', e.target.value)}>
                <option value="">選択してください</option>
                {master.calibers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <InlineAdd
                value={newCal} onChange={setNewCal}
                onAdd={handleAddCal}
                placeholder="新規Cal.を入力..."
              />
            </div>
            <div>
              <label className="label-sm">ベースCal.</label>
              <select className="input-base" value={form.baseCaliberId} onChange={e => set('baseCaliberId', e.target.value)}>
                <option value="">なし</option>
                {master.calibers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <InlineAdd
                value={newBaseCal} onChange={setNewBaseCal}
                onAdd={handleAddBaseCal}
                placeholder="新規ベースCal.を入力..."
              />
            </div>
            <div>
              <label className="label-sm">ムーブメント製造元</label>
              <select className="input-base" value={form.movementMakerId} onChange={e => set('movementMakerId', e.target.value)}>
                <option value="">選択してください</option>
                {master.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <InlineAdd
                value={newMovMaker} onChange={setNewMovMaker}
                onAdd={handleAddMovMaker}
                placeholder="新規製造元を入力..."
              />
            </div>
            <div>
              <label className="label-sm">ベースムーブメント製造元</label>
              <select className="input-base" value={form.baseMakerId} onChange={e => set('baseMakerId', e.target.value)}>
                <option value="">なし</option>
                {master.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <InlineAdd
                value={newBaseMaker} onChange={setNewBaseMaker}
                onAdd={handleAddBaseMaker}
                placeholder="新規製造元を入力..."
              />
            </div>
          </div>
        </section>
      )}

      {/* 外装：時計情報 */}
      {!isInterior && (
        <section className="space-y-3 border rounded-lg p-4 bg-amber-50">
          <h2 className="font-semibold text-sm text-amber-700">時計情報</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">ブランド</label>
              <select className="input-base" value={form.brandId} onChange={e => set('brandId', e.target.value)}>
                <option value="">選択してください</option>
                {master.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <InlineAdd
                value={newBrand} onChange={setNewBrand}
                onAdd={handleAddBrand}
                placeholder="新規ブランドを入力..."
              />
            </div>
            <div>
              <label className="label-sm">モデル</label>
              <select className="input-base" value={form.modelId} onChange={e => set('modelId', e.target.value)}>
                <option value="">選択してください</option>
                {master.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <InlineAdd
                value={newModel} onChange={setNewModel}
                onAdd={handleAddModel}
                placeholder={form.brandId ? 'モデル名を入力...' : 'ブランドを先に選択'}
                disabled={!form.brandId}
              />
            </div>
            <div className="col-span-2">
              <label className="label-sm">対応Ref（カンマ区切り）</label>
              <input className="input-base" value={form.watchRefs}
                onChange={e => set('watchRefs', e.target.value)}
                placeholder="例: 116610LN, 116610LV" />
            </div>
          </div>
        </section>
      )}

      {/* 部品情報 */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">部品情報</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">部品名（日本語）<span className="text-red-500">*</span></label>
            <input className="input-base" value={form.nameJp} onChange={e => set('nameJp', e.target.value)} placeholder="例: 主ゼンマイ" />
          </div>
          <div>
            <label className="label-sm">部品名（英語）</label>
            <input className="input-base" value={form.nameEn} onChange={e => set('nameEn', e.target.value)} placeholder="例: Mainspring" />
          </div>
          <div>
            <label className="label-sm">部品Ref（カンマ区切り）</label>
            <input className="input-base" value={form.partRefs} onChange={e => set('partRefs', e.target.value)} placeholder="例: 1530-0005" />
          </div>
          <div>
            <label className="label-sm">Cousins番号</label>
            <input className="input-base" value={form.cousinsNumber} onChange={e => set('cousinsNumber', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">グレード</label>
            <select className="input-base" value={form.grade} onChange={e => set('grade', e.target.value)}>
              {['純正','FIT','合わせ'].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">サイズ</label>
            <input className="input-base" value={form.size} onChange={e => set('size', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">画像キー（Supabase Storage）</label>
            <input className="input-base" value={form.photoKey} onChange={e => set('photoKey', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label-sm">備考1</label>
            <textarea className="input-base" rows={2} value={form.notes1} onChange={e => set('notes1', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label-sm">備考2</label>
            <textarea className="input-base" rows={2} value={form.notes2} onChange={e => set('notes2', e.target.value)} />
          </div>
        </div>
      </section>

      {/* 価格情報 */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">価格情報</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">仕入通貨</label>
            <select className="input-base" value={form.costCurrency} onChange={e => set('costCurrency', e.target.value)}>
              {['JPY','GBP','USD','EUR'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {form.costCurrency !== 'JPY' && (
            <div className="col-span-2 text-xs text-gray-500">
              現在レート：1 {form.costCurrency} = ¥{rates[form.costCurrency]?.toLocaleString() ?? '---'}
              　（{rateUpdatedAt} 更新）
            </div>
          )}
          <div>
            <label className="label-sm">仕入原価（外貨）</label>
            <input type="number" className="input-base" value={form.costOriginal} onChange={e => set('costOriginal', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">仕入価格（円）</label>
            <input type="number" className="input-base" value={form.latestCostYen} onChange={e => set('latestCostYen', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">掛け率</label>
            <input type="number" step="0.1" min="1.1" max="2.0" className="input-base"
              value={form.markupRate} onChange={e => set('markupRate', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">上代（自動計算）</label>
            <div className="input-base bg-gray-50 text-gray-700 font-mono">
              ¥{parseInt(form.retailPrice).toLocaleString()}
            </div>
          </div>
        </div>
      </section>

      {/* 在庫情報 */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">在庫情報</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">在庫数</label>
            <input type="number" className="input-base" value={form.stockQuantity} onChange={e => set('stockQuantity', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">保管場所</label>
            <input className="input-base" value={form.location} onChange={e => set('location', e.target.value)} placeholder="例: A-3-2" />
          </div>
          <div>
            <label className="label-sm">最小在庫アラート数</label>
            <input type="number" className="input-base" value={form.minStockAlert} onChange={e => set('minStockAlert', e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" id="alertEnabled" checked={form.minStockAlertEnabled}
              onChange={e => set('minStockAlertEnabled', e.target.checked)} />
            <label htmlFor="alertEnabled" className="text-sm">アラートを有効にする</label>
          </div>
          <div className="col-span-2">
            <label className="label-sm">仕入先</label>
            <select className="input-base" value={form.supplierId} onChange={e => set('supplierId', e.target.value)}>
              <option value="">選択してください</option>
              {master.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* ボタン */}
      <div className="flex gap-3 justify-end pb-10">
        <button type="button" onClick={() => router.push('/parts')}
          className="px-5 py-2 rounded border text-gray-600 hover:bg-gray-50">
          キャンセル
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving || !form.nameJp}
          className="px-6 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  )
}
