'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { updateRepairStatus } from "@/actions/repair-actions";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = [
  '受付',
  '見積中',
  '承認待ち',
  '部品待ち(未注文)',
  '部品待ち(注文済み)',
  '部品入荷済み',
  '作業待ち',
  '作業中',
  '作業完了',
  '納品済み',
  'キャンセル',
  '保留',
]

type Warning = {
  partName: string
  required: number
  stock: number
  orderRequestId: number
}

export function StatusUpdateForm({ repairId, currentStatus }: { repairId: number, currentStatus: string }) {
  const [status, setStatus] = useState(currentStatus);
  const [isPending, setIsPending] = useState(false);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const router = useRouter();

  const handleUpdate = async () => {
    if (status === currentStatus) return;

    setIsPending(true);

    if (status === '作業待ち') {
      // 在庫チェック付きAPIを呼ぶ
      const res = await fetch(`/api/repairs/${repairId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      setIsPending(false);

      if (!res.ok) {
        alert('更新に失敗しました。');
        return;
      }

      if (data.warnings && data.warnings.length > 0) {
        setWarnings(data.warnings);
        return;
      }
    } else {
      // 通常のServer Action経由
      const result = await updateRepairStatus(repairId, status);
      setIsPending(false);
      if (!result.success) {
        alert('更新に失敗しました。');
        return;
      }
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Button
          onClick={handleUpdate}
          disabled={isPending || status === currentStatus}
          size="sm"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          更新
        </Button>
      </div>

      {/* 在庫不足警告ダイアログ */}
      {warnings.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-red-600">在庫不足の部品があります</h2>
            <div className="border rounded divide-y text-sm">
              {warnings.map((w, i) => (
                <div key={i} className="px-3 py-2 flex justify-between">
                  <span className="font-medium">{w.partName}</span>
                  <span className="text-gray-500">
                    必要: <span className="font-bold text-red-500">{w.required}</span>　在庫: {w.stock}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">不足分は自動的に発注リストに追加されました。</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setWarnings([])}>
                このまま続ける
              </Button>
              <Button onClick={() => router.push('/orders')}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                発注リストを確認する
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
