"use client";

import React, { useEffect, useState } from "react";
import { getCustomerById, updateCustomer } from "@/actions/customer-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Save, Building2, User, Star, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/components/ui/use-toast";

export default function CustomerEditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const id = parseInt(params.id);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getCustomerById(id).then((res) => {
      if (res) {
        setData(res);
      } else {
        toast({ title: "エラー", description: "顧客が見つかりません", variant: "destructive" });
        router.push("/customers");
      }
      setIsLoading(false);
    });
  }, [id, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const res = await updateCustomer(id, data);
    if (res.success) {
      toast({ title: "保存完了", description: "顧客情報を更新しました。" });
      router.push("/customers");
      return;
    }

    alert(res.error);
    setIsSaving(false);
  };

  if (isLoading) return <div className="p-8 text-center text-zinc-400">読み込み中...</div>;
  if (!data) return null;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-8">
          <ArrowLeft className="w-4 h-4 mr-1" /> 戻る
        </Button>
        <h1 className="text-xl font-bold text-zinc-900">顧客情報編集</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-6 space-y-4 border-zinc-200 shadow-sm">
          <div className="flex bg-zinc-100 p-1 rounded-md mb-6 max-w-[240px]">
            <button
              type="button"
              onClick={() => setData({ ...data, type: "business" })}
              className={cn(
                "flex-1 text-xs font-bold py-1.5 rounded-sm transition-all flex items-center justify-center gap-1",
                data.type === "business" ? "bg-white shadow-sm text-blue-600" : "text-zinc-400"
              )}
            >
              <Building2 className="w-3 h-3" /> 業者 (B2B)
            </button>
            <button
              type="button"
              onClick={() => setData({ ...data, type: "individual" })}
              className={cn(
                "flex-1 text-xs font-bold py-1.5 rounded-sm transition-all flex items-center justify-center gap-1",
                data.type === "individual" ? "bg-white shadow-sm text-green-600" : "text-zinc-400"
              )}
            >
              <User className="w-3 h-3" /> 個人 (B2C)
            </button>
          </div>

          <div className="space-y-4">
            {data.type === "business" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-zinc-500">
                    会社名・店名<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={data.companyName || ""}
                    onChange={(e) => setData({ ...data, companyName: e.target.value })}
                    className="font-bold border-zinc-200"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-zinc-500">担当者名 (任意)</Label>
                  <Input
                    value={data.name || ""}
                    onChange={(e) => setData({ ...data, name: e.target.value })}
                    className="border-zinc-200"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-zinc-500">
                    氏名<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={data.name || ""}
                    onChange={(e) => setData({ ...data, name: e.target.value })}
                    className="font-bold border-zinc-200"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-zinc-500">フリガナ (任意)</Label>
                  <Input
                    value={data.kana || ""}
                    onChange={(e) => setData({ ...data, kana: e.target.value })}
                    className="border-zinc-200"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-zinc-500">顧客ランク (1-5)</Label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        "w-5 h-5 cursor-pointer",
                        star <= data.rank ? "text-yellow-400 fill-yellow-400" : "text-zinc-200"
                      )}
                      onClick={() => setData({ ...data, rank: star })}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-zinc-500">フリガナ (業者メモ用)</Label>
                <Input
                  value={data.kana || ""}
                  onChange={(e) => setData({ ...data, kana: e.target.value })}
                  className="border-zinc-200"
                  disabled={data.type === "individual"}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-500">電話番号</Label>
              <Input
                value={data.phone || ""}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
                className="border-zinc-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-500">メールアドレス</Label>
              <Input
                value={data.email || ""}
                onChange={(e) => setData({ ...data, email: e.target.value })}
                className="border-zinc-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-500 flex items-center gap-1">
                <MessageCircle className="w-3 h-3 text-emerald-500" /> LINE ID
              </Label>
              <Input
                value={data.lineId || ""}
                onChange={(e) => setData({ ...data, lineId: e.target.value })}
                className="border-zinc-200"
                placeholder="line_id"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-500">郵便番号</Label>
              <Input
                value={data.zipCode || ""}
                onChange={(e) => setData({ ...data, zipCode: e.target.value })}
                className="border-zinc-200"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-zinc-500">住所</Label>
            <Input
              value={data.address || ""}
              onChange={(e) => setData({ ...data, address: e.target.value })}
              className="border-zinc-200"
            />
          </div>
        </Card>

        {data.type === "business" && (
          <Card className="p-6 space-y-4 border-l-4 border-l-blue-500 shadow-sm border-zinc-200">
            <h3 className="text-sm font-bold flex items-center gap-2 text-zinc-700">取引先設定</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPartner"
                  checked={data.isPartner}
                  onChange={(e) => setData({ ...data, isPartner: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="isPartner" className="text-sm cursor-pointer font-bold">
                  公式パートナーとして扱う
                </Label>
              </div>
              {data.isPartner && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold text-zinc-500">修理番号プレフィックス:</Label>
                  <Input
                    value={data.prefix || ""}
                    onChange={(e) => setData({ ...data, prefix: e.target.value.toUpperCase() })}
                    className="w-20 h-8 font-mono uppercase text-center"
                    maxLength={3}
                  />
                </div>
              )}
            </div>
            <p className="text-[10px] text-zinc-400 italic">
              パートナー設定を有効にすると、修理受付時に専用の修理番号プレフィックス
              （例: {data.prefix || "T"}-001）が自動採番されます。
            </p>
          </Card>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={() => router.push("/customers")} className="text-zinc-500">
            キャンセル
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 min-w-[120px]" disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" /> {isSaving ? "保存中..." : "保存する"}
          </Button>
        </div>
      </form>

      <div className="pt-12 border-t">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">関連する修理履歴</h3>
        <div className="space-y-2">
          {data.repairs?.map((r: any) => (
            <Link href={`/repairs/${r.id}`} key={r.id}>
              <div className="bg-white p-3 border border-zinc-200 rounded-md hover:border-blue-300 transition-colors flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-zinc-400 mr-2">{r.inquiryNumber}</span>
                  <span className="font-bold">{r.status}</span>
                </div>
                <span className="text-zinc-400">{new Date(r.createdAt).toLocaleDateString("ja-JP")}</span>
              </div>
            </Link>
          ))}
          {(!data.repairs || data.repairs.length === 0) && (
            <p className="text-zinc-400 italic text-xs">修理履歴はありません</p>
          )}
        </div>
      </div>
    </div>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}
