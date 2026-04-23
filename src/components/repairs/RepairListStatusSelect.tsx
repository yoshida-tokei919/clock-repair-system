'use client';

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { updateRepairStatus } from "@/actions/repair-actions";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

const STATUS_COLOR: Record<string, string> = {
  '受付':             'bg-blue-500 hover:bg-blue-600',
  '見積中':           'bg-amber-500 hover:bg-amber-600',
  '承認待ち':         'bg-yellow-500 hover:bg-yellow-600',
  '部品待ち(未注文)': 'bg-orange-400 hover:bg-orange-500',
  '部品待ち(注文済み)':'bg-orange-600 hover:bg-orange-700',
  '部品入荷済み':     'bg-lime-500 hover:bg-lime-600',
  '作業待ち':         'bg-cyan-500 hover:bg-cyan-600',
  '作業中':           'bg-indigo-500 hover:bg-indigo-600',
  '作業完了':         'bg-emerald-500 hover:bg-emerald-600',
  '納品済み':         'bg-zinc-500 hover:bg-zinc-600',
  'キャンセル':       'bg-red-500 hover:bg-red-600',
  '保留':             'bg-gray-400 hover:bg-gray-500',
}

type Warning = {
  partName: string
  required: number
  stock: number
  orderRequestId: number
}

interface Props {
  id: number;
  currentStatus: string;
}

export function RepairListStatusSelect({ id, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [isPending, setIsPending] = useState(false);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const router = useRouter();

  const handleSelect = async (newStatus: string) => {
    if (newStatus === status) return;

    const oldStatus = status;
    setStatus(newStatus);
    setIsPending(true);

    if (newStatus === '作業待ち') {
      const res = await fetch(`/api/repairs/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      setIsPending(false);

      if (!res.ok) {
        setStatus(oldStatus);
        alert('更新に失敗しました。');
        return;
      }

      if (data.warnings && data.warnings.length > 0) {
        setWarnings(data.warnings);
      }
    } else {
      const result = await updateRepairStatus(id, newStatus);
      setIsPending(false);

      if (!result.success) {
        setStatus(oldStatus);
        alert('更新に失敗しました。');
      }
    }
  };

  const colorClass = STATUS_COLOR[status] ?? 'bg-gray-400 hover:bg-gray-500';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="focus:outline-none" asChild>
          <Badge className={`cursor-pointer ${colorClass} ${isPending ? 'opacity-70' : ''}`}>
            {isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            {status}
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {STATUS_OPTIONS.map(s => (
            <DropdownMenuItem key={s} onClick={() => handleSelect(s)}>{s}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

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
