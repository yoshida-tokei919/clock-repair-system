"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  photoSharingFallbacks,
  repairPhotoCategories,
  repairPhotoCategoryLabels,
  type PhotoSharingValues,
} from "@/lib/repair-photo-sharing";

type Defaults = Record<(typeof repairPhotoCategories)[number], PhotoSharingValues>;

export default function PhotoSharingDefaultsPage() {
  const [defaults, setDefaults] = useState<Defaults>(photoSharingFallbacks);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/photo-sharing-defaults")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setDefaults((current) => ({ ...current, ...data })))
      .catch(() => setMessage("設定を読み込めませんでした。"));
  }, []);

  const update = (category: (typeof repairPhotoCategories)[number], key: keyof PhotoSharingValues, checked: boolean) => {
    setDefaults((current) => ({ ...current, [category]: { ...current[category], [key]: checked } }));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/photo-sharing-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: repairPhotoCategories.map((category) => ({ category, ...defaults[category] })) }),
      });
      if (!response.ok) throw new Error();
      setMessage("保存しました。変更はこれから作成する写真にだけ適用されます。");
    } catch {
      setMessage("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <div><h1 className="text-2xl font-bold">写真共有デフォルト設定</h1><p className="mt-1 text-sm text-zinc-600">撮影箇所ごとの初期共有先です。既存の案件写真は変更しません。</p></div>
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="grid grid-cols-[1fr_repeat(3,5rem)] border-b bg-zinc-50 px-4 py-3 text-xs font-bold text-zinc-600"><span>撮影箇所</span><span>共有</span><span>事例</span><span>SNS</span></div>
      {repairPhotoCategories.map((category) => <div key={category} className="grid grid-cols-[1fr_repeat(3,5rem)] items-center border-b px-4 py-3 text-sm last:border-b-0"><span>{repairPhotoCategoryLabels[category]}</span>{(["customerVisible", "publicCaseVisible", "snsVisible"] as const).map((key) => <label key={key}><Checkbox checked={defaults[category][key]} onCheckedChange={(checked) => update(category, key, checked === true)} /></label>)}</div>)}
    </div>
    {message && <p className="text-sm text-zinc-600">{message}</p>}
    <Button onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
  </main>;
}
