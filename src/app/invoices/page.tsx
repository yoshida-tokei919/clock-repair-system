"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Partner = {
    id: number;
    name: string;
    companyName: string | null;
    prefix: string | null;
};

type PreviewRepair = {
    id: number;
    inquiryNumber: string;
    partnerRef: string | null;
    endUserName: string | null;
    deliveryDate: string;
    slipNumber: string;
    watch: { brand: string; model: string; ref: string };
    subtotal: number;
};

type Invoice = {
    id: number;
    invoiceNumber: string;
    issuedDate: string;
    totalAmount: number;
    taxAmount: number;
    status: string;
    paymentDueDate: string | null;
    customer: { id: number; name: string; companyName: string | null };
    repairs: { id: number }[];
};

// 現在の月を "YYYY-MM" 形式で返す
function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("ja-JP", {
        year: "numeric", month: "2-digit", day: "2-digit",
        timeZone: "Asia/Tokyo",
    });
}

export default function InvoicesPage() {
    const router = useRouter();

    // --- 左ペイン: 請求書一覧 ---
    const [invoices, setInvoices] = useState<Invoice[]>([]);

    // --- 右ペイン: 新規作成フォーム ---
    const [partners, setPartners] = useState<Partner[]>([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState<number | "">("");
    const [selectedMonth, setSelectedMonth] = useState(currentMonth());
    const [previews, setPreviews] = useState<PreviewRepair[] | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [paymentDueDate, setPaymentDueDate] = useState("");
    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("/api/invoices")
            .then((r) => r.json())
            .then(setInvoices);
        fetch("/api/partners")
            .then((r) => r.json())
            .then((data) => setPartners(data.partners || []));
    }, []);

    // 取引先または月が変わったらプレビューをリセット
    useEffect(() => {
        setPreviews(null);
        setSelectedIds(new Set());
    }, [selectedPartnerId, selectedMonth]);

    async function loadPreview() {
        if (!selectedPartnerId || !selectedMonth) return;
        setPreviewLoading(true);
        setError("");
        try {
            const res = await fetch(
                `/api/invoices/preview?customerId=${selectedPartnerId}&month=${selectedMonth}`
            );
            const data = await res.json();
            setPreviews(data);
            setSelectedIds(new Set(data.map((r: PreviewRepair) => r.id)));
        } catch {
            setError("修理案件の取得に失敗しました");
        } finally {
            setPreviewLoading(false);
        }
    }

    function toggleRepair(id: number) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    async function createInvoice() {
        if (!selectedPartnerId || selectedIds.size === 0) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/invoices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customerId: selectedPartnerId,
                    repairIds: Array.from(selectedIds),
                    paymentDueDate: paymentDueDate || undefined,
                }),
            });
            if (!res.ok) {
                const e = await res.json();
                setError(e.error || "請求書の作成に失敗しました");
                return;
            }
            const invoice = await res.json();
            router.push(`/documents/invoice/${invoice.id}`);
        } catch {
            setError("請求書の作成に失敗しました");
        } finally {
            setLoading(false);
        }
    }

    const selectedPreviews = previews?.filter((r) => selectedIds.has(r.id)) || [];
    const subtotal = selectedPreviews.reduce((s, r) => s + r.subtotal, 0);
    const tax = Math.floor(subtotal * 0.1);
    const total = subtotal + tax;

    const selectedPartner = partners.find((p) => p.id === selectedPartnerId);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link href="/repairs" className="text-sm text-blue-600 hover:underline mb-1 block">
                            ← 修理一覧へ
                        </Link>
                        <h1 className="text-2xl font-bold text-gray-800">請求書管理</h1>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* 左ペイン: 発行済み請求書一覧 */}
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700 mb-4">発行済み請求書</h2>
                        {invoices.length === 0 ? (
                            <p className="text-gray-400 text-sm bg-white rounded-lg p-6 border border-gray-200">
                                まだ請求書がありません
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {invoices.map((inv) => (
                                    <Link
                                        key={inv.id}
                                        href={`/documents/invoice/${inv.id}`}
                                        className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition-all"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="font-mono font-semibold text-blue-700">
                                                    {inv.invoiceNumber}
                                                </span>
                                                <span className="ml-2 text-gray-600 text-sm">
                                                    {inv.customer.companyName || inv.customer.name}
                                                </span>
                                            </div>
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                    inv.status === "paid"
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-yellow-100 text-yellow-700"
                                                }`}
                                            >
                                                {inv.status === "paid" ? "入金済" : "未入金"}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex gap-4 text-xs text-gray-500">
                                            <span>発行: {fmtDate(inv.issuedDate)}</span>
                                            <span>修理 {inv.repairs.length}件</span>
                                            <span className="font-semibold text-gray-700">
                                                ¥{(inv.totalAmount + inv.taxAmount).toLocaleString()}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 右ペイン: 新規作成 */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-700 mb-6">月次請求書を新規作成</h2>

                        {/* ① 取引先選択 */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-600 mb-1">
                                取引先（法人パートナー）
                            </label>
                            <select
                                value={selectedPartnerId}
                                onChange={(e) =>
                                    setSelectedPartnerId(e.target.value ? Number(e.target.value) : "")
                                }
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">-- 取引先を選択 --</option>
                                {partners.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        [{p.prefix || "?"}] {p.companyName || p.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* ② 対象月選択 */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-600 mb-1">
                                対象月（納品日基準）
                            </label>
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* ③ 修理案件取得ボタン */}
                        <button
                            onClick={loadPreview}
                            disabled={!selectedPartnerId || !selectedMonth || previewLoading}
                            className="w-full mb-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-40"
                        >
                            {previewLoading ? "取得中..." : "対象案件を確認する"}
                        </button>

                        {/* ③ 修理案件プレビュー */}
                        {previews !== null && (
                            <>
                                {previews.length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg mb-6">
                                        {selectedMonth.replace("-", "年")}月の納品済み未請求案件はありません
                                    </p>
                                ) : (
                                    <div className="mb-6">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-gray-600">
                                                対象案件（{previews.length}件）
                                            </span>
                                            <button
                                                className="text-xs text-blue-500 hover:underline"
                                                onClick={() =>
                                                    setSelectedIds(
                                                        selectedIds.size === previews.length
                                                            ? new Set()
                                                            : new Set(previews.map((r) => r.id))
                                                    )
                                                }
                                            >
                                                {selectedIds.size === previews.length ? "全解除" : "全選択"}
                                            </button>
                                        </div>
                                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50 text-gray-500">
                                                    <tr>
                                                        <th className="w-8 px-2 py-2"></th>
                                                        <th className="px-2 py-2 text-left">管理No</th>
                                                        <th className="px-2 py-2 text-left">時計</th>
                                                        <th className="px-2 py-2 text-left">納品日</th>
                                                        <th className="px-2 py-2 text-right">金額(税抜)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {previews.map((r) => (
                                                        <tr
                                                            key={r.id}
                                                            className={`border-t border-gray-100 cursor-pointer hover:bg-blue-50 ${
                                                                selectedIds.has(r.id) ? "bg-blue-50" : ""
                                                            }`}
                                                            onClick={() => toggleRepair(r.id)}
                                                        >
                                                            <td className="px-2 py-2 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedIds.has(r.id)}
                                                                    onChange={() => toggleRepair(r.id)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="accent-blue-600"
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2 font-mono text-blue-700">
                                                                {r.inquiryNumber}
                                                                {r.partnerRef && (
                                                                    <span className="text-gray-400 ml-1">
                                                                        ({r.partnerRef})
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <div>{r.watch.brand} {r.watch.model}</div>
                                                                {r.endUserName && (
                                                                    <div className="text-gray-400">{r.endUserName}</div>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-2 text-gray-500">
                                                                {fmtDate(r.deliveryDate)}
                                                            </td>
                                                            <td className="px-2 py-2 text-right">
                                                                ¥{r.subtotal.toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* 金額サマリー */}
                                        <div className="mt-3 bg-gray-50 rounded-lg px-4 py-3 text-sm">
                                            <div className="flex justify-between text-gray-500">
                                                <span>小計（{selectedIds.size}件）</span>
                                                <span>¥{subtotal.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-gray-500">
                                                <span>消費税（10%）</span>
                                                <span>¥{tax.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-gray-800 mt-1 pt-1 border-t border-gray-200">
                                                <span>合計請求額</span>
                                                <span>¥{total.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ④ 支払期限・発行ボタン */}
                                {selectedIds.size > 0 && (
                                    <>
                                        <div className="mb-4">
                                            <label className="block text-sm font-medium text-gray-600 mb-1">
                                                支払期限（任意）
                                            </label>
                                            <input
                                                type="date"
                                                value={paymentDueDate}
                                                onChange={(e) => setPaymentDueDate(e.target.value)}
                                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        {error && (
                                            <p className="text-red-500 text-sm mb-3">{error}</p>
                                        )}

                                        <button
                                            onClick={createInvoice}
                                            disabled={loading}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
                                        >
                                            {loading
                                                ? "作成中..."
                                                : `${selectedPartner?.companyName || selectedPartner?.name} 宛 請求書を発行`}
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
