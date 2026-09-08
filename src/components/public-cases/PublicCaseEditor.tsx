"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

type Photo = { id: number; storageKey: string; fileName?: string | null; publicCaseVisible: boolean };
type CaseImage = { id: number; storagePath?: string | null; url?: string | null; isPrimary: boolean };
type EditableWorkItem = { id?: number; displayName: string };
type PublicCaseEditorData = {
  id: number;
  repair: { id: number; inquiryNumber?: string | null; photoPostingOptOut: boolean; photos: Photo[] };
  brandDisplayName?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  ref?: string | null;
  caliber?: string | null;
  b2cTitle?: string | null;
  b2cSummary?: unknown;
  reviewStatus: string;
  b2cPublishStatus: string;
  images: CaseImage[];
  workItems: { id: number; b2cDisplayName?: string | null; b2bDisplayName?: string | null; normalizedWorkName?: string | null; sourceText: string }[];
  partItems: { id: number; displayName?: string | null; sourceText: string }[];
};

function photoUrl(photo: Photo): string {
  if (/^(https?:|data:)/i.test(photo.storageKey)) return photo.storageKey;
  if (/^repairs\/\d+\/\d{6}\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(photo.storageKey)) return `/api/repair-photos/${photo.id}`;
  return "";
}

function summaryText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function display(value?: string | null): string {
  return value?.trim() || "—";
}

export function PublicCaseEditor({ data }: { data: PublicCaseEditorData }) {
  const candidatePhotos = useMemo(
    () => data.repair.photos.filter((photo) => photo.publicCaseVisible),
    [data.repair.photos],
  );
  const sourceImageIdByPhotoId = useMemo(() => new Map(data.images.flatMap((image) => {
    const sourceId = image.url?.match(/[?&]sourceRepairPhotoId=(\d+)/)?.[1];
    return sourceId ? [[Number(sourceId), image.id] as const] : [];
  })), [data.images]);
  const initiallySelected = useMemo(() => {
    const paths = new Set(data.images.map((image) => image.storagePath).filter(Boolean));
    const sourceIds = new Set(data.images.flatMap((image) => {
      const match = image.url?.match(/[?&]sourceRepairPhotoId=(\d+)/);
      return match ? [Number(match[1])] : [];
    }));
    return candidatePhotos
      .filter((photo) => paths.has(photo.storageKey) || sourceIds.has(photo.id))
      .map((photo) => photo.id);
  }, [candidatePhotos, data.images]);
  const initialPrimary = useMemo(() => {
    const primary = data.images.find((image) => image.isPrimary);
    const sourceId = primary?.url?.match(/[?&]sourceRepairPhotoId=(\d+)/)?.[1];
    const sourcePhotoId = sourceId ? Number(sourceId) : data.repair.photos.find((photo) => photo.storageKey === primary?.storagePath)?.id;
    return sourcePhotoId && data.repair.photos.some((photo) => photo.id === sourcePhotoId) ? sourcePhotoId : null;
  }, [data.images, data.repair.photos]);

  const [title, setTitle] = useState(data.b2cTitle ?? "");
  const [summary, setSummary] = useState(summaryText(data.b2cSummary));
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>(initiallySelected);
  const [primaryPhotoId, setPrimaryPhotoId] = useState<number | null>(initialPrimary);
  const [snapshotImageIds, setSnapshotImageIds] = useState<number[]>(() => data.images.map((image) => image.id));
  const [primaryImageId, setPrimaryImageId] = useState<number | null>(() => data.images.find((image) => image.isPrimary)?.id ?? null);
  const [editableWorkItems, setEditableWorkItems] = useState<EditableWorkItem[]>(() =>
    data.workItems.map((item) => ({
      id: item.id,
      displayName: item.b2cDisplayName?.trim() || item.b2bDisplayName?.trim() || item.normalizedWorkName?.trim() || item.sourceText,
    })),
  );
  const [isSaving, setIsSaving] = useState(false);

  const isPublished = data.reviewStatus === "APPROVED" && data.b2cPublishStatus === "PUBLISHED";

  const togglePhoto = (photoId: number, selected: boolean) => {
    setSelectedPhotoIds((current) => selected
      ? Array.from(new Set([...current, photoId]))
      : current.filter((id) => id !== photoId));
    if (!selected) {
      const snapshotImageId = sourceImageIdByPhotoId.get(photoId);
      if (snapshotImageId) setSnapshotImageIds((current) => current.filter((id) => id !== snapshotImageId));
      if (primaryPhotoId === photoId) setPrimaryPhotoId(null);
    }
    if (selected && primaryPhotoId === null && primaryImageId === null) setPrimaryPhotoId(photoId);
  };

  const submit = async (action: "save" | "publish" | "unpublish") => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/public-cases/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          b2cTitle: title,
          b2cSummary: summary,
          photoIds: selectedPhotoIds,
          primaryPhotoId,
          snapshotImageIds,
          primaryImageId,
          workItems: editableWorkItems,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "保存に失敗しました。");
      toast({ title: action === "publish" ? "B2C公開しました" : action === "unpublish" ? "非公開に戻しました" : "下書きを保存しました" });
      window.location.reload();
    } catch (error) {
      toast({ title: "PublicCaseを更新できませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/repairs/${data.repair.id}`} className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Repairへ戻る
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">B2C事例下書き</h1>
          <p className="text-sm text-zinc-500">修理番号: {display(data.repair.inquiryNumber)} / PublicCase ID: {data.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => submit("save")} disabled={isSaving || data.repair.photoPostingOptOut}><Save className="mr-1 h-4 w-4" />下書き保存</Button>
          {isPublished ? (
            <Button type="button" variant="outline" onClick={() => submit("unpublish")} disabled={isSaving || data.repair.photoPostingOptOut}>非公開に戻す</Button>
          ) : (
            <Button type="button" onClick={() => submit("publish")} disabled={isSaving || data.repair.photoPostingOptOut}>公開する</Button>
          )}
          {isPublished ? <Link href={`/cases/gallery/${data.id}`} target="_blank" className="inline-flex items-center rounded-md border border-zinc-300 px-3 text-sm font-medium"><ExternalLink className="mr-1 h-4 w-4" />公開ページ</Link> : null}
        </div>
      </div>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-4 text-base font-bold">基本情報</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-zinc-500">ブランド</dt><dd>{display(data.brandDisplayName) !== "—" ? display(data.brandDisplayName) : display(data.brandName)}</dd></div>
          <div><dt className="text-zinc-500">モデル</dt><dd>{display(data.modelName)}</dd></div>
          <div><dt className="text-zinc-500">Ref</dt><dd>{display(data.ref)}</dd></div>
          <div><dt className="text-zinc-500">Cal</dt><dd>{display(data.caliber)}</dd></div>
          <div><dt className="text-zinc-500">公開状態</dt><dd>{isPublished ? "公開中" : "下書き・非公開"}</dd></div>
        </dl>
      </section>

      <section className="space-y-4 rounded-lg border bg-white p-5">
        <h2 className="text-base font-bold">B2C表示</h2>
        <label className="block text-sm font-medium">B2Cタイトル<Input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1" /></label>
        <label className="block text-sm font-medium">B2C概要・説明<Textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-1 min-h-32" /></label>
        <p className="text-xs text-zinc-500">価格はこの画面・B2C公開ページともに表示しません。</p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-3 text-base font-bold">作業内容</h2>
        <p className="mb-3 text-sm text-zinc-500">公開用snapshotだけを編集します。元Repairや作業マスタは変更しません。</p>
        <div className="space-y-2">
          {editableWorkItems.map((item, index) => (
            <div key={item.id ?? `new-${index}`} className="flex gap-2">
              <Input
                value={item.displayName}
                onChange={(event) => setEditableWorkItems((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, displayName: event.target.value } : current))}
                aria-label="修理内容"
              />
              <Button type="button" size="icon" variant="outline" onClick={() => setEditableWorkItems((items) => items.filter((_, currentIndex) => currentIndex !== index))} aria-label="修理内容を削除">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setEditableWorkItems((items) => [...items, { displayName: "" }])}>
          <Plus className="mr-1 h-4 w-4" />修理内容を追加
        </Button>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-3 text-base font-bold">交換部品</h2>
        {data.partItems.length ? <ul className="space-y-2 text-sm">{data.partItems.map((item) => <li key={item.id}>{display(item.displayName) !== "—" ? display(item.displayName) : item.sourceText}</li>)}</ul> : <p className="text-sm text-zinc-500">交換部品はありません。</p>}
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-1 text-base font-bold">写真</h2>
        <p className="mb-4 text-sm text-zinc-500">元Repairに保存済みの写真だけを選択します。写真なしでも公開できます。</p>
        {data.repair.photoPostingOptOut ? <p className="text-sm text-amber-700">お客様が事例・SNS掲載を希望していないため、新規の写真候補は表示しません。既存PublicCase画像は変更しません。</p> : candidatePhotos.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">{candidatePhotos.map((photo) => {
          const selected = selectedPhotoIds.includes(photo.id);
          const checkboxId = `public-case-photo-${photo.id}`;
          const primaryId = `public-case-primary-${photo.id}`;
          return <div key={photo.id} className="overflow-hidden rounded border bg-zinc-50 text-sm">
            <img src={photoUrl(photo)} alt={photo.fileName || "Repair photo"} className="aspect-square w-full object-cover" />
            <div className="flex items-center gap-2 p-2"><input id={checkboxId} type="checkbox" checked={selected} onChange={(event) => togglePhoto(photo.id, event.target.checked)} /><label htmlFor={checkboxId}>使用する</label></div>
            {selected ? <div className="flex items-center gap-2 px-2 pb-2"><input id={primaryId} type="radio" name="primary-photo" checked={primaryPhotoId === photo.id || primaryImageId === sourceImageIdByPhotoId.get(photo.id)} onChange={() => { setPrimaryPhotoId(photo.id); setPrimaryImageId(sourceImageIdByPhotoId.get(photo.id) ?? null); }} /><label htmlFor={primaryId}>メイン写真</label></div> : null}
          </div>;
        })}</div> : <p className="text-sm text-zinc-500">事例公開を許可した元Repair写真はありません。</p>}
        {data.images.length > 0 ? <div className="mt-5 border-t pt-4"><p className="mb-3 text-sm text-zinc-500">保存済みPublicCase snapshot</p><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">{data.images.map((image, index) => image.url ? <div key={`${image.storagePath ?? "image"}-${index}`} className="overflow-hidden rounded border bg-zinc-50"><img src={image.url} alt="PublicCase snapshot" className="aspect-square w-full object-cover" /></div> : null)}</div></div> : null}
      </section>
    </main>
  );
}
