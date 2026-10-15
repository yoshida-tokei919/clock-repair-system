"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ImageOff } from "lucide-react";
import Link from "next/link";
import type { GalleryCard } from "@/lib/public-cases";

function text(value?: string | null): string {
  return (value ?? "").trim();
}

function getBrandDisplayName(publicCase: GalleryCard): string {
  return text(publicCase.brandDisplayName) || text(publicCase.brandName);
}

function getWorkDisplayName(publicCase: GalleryCard): string {
  const work = publicCase.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) => text(workItem.b2cDisplayName) || text(workItem.b2bDisplayName))
    .find(Boolean);

  return work || "修理内容確認中";
}

function getTitle(publicCase: GalleryCard, workName: string): string {
  return (
    text(publicCase.modelName) ||
    (text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "") ||
    (text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "") ||
    workName ||
    "修理事例"
  );
}

function getMeta(publicCase: GalleryCard): string {
  return [
    text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "",
    text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

function CaseImage({ publicCase }: { publicCase: GalleryCard }) {
  const image = publicCase.images[0];
  const src = text(image?.url);
  const brand = getBrandDisplayName(publicCase);
  const title = text(publicCase.modelName) || text(publicCase.ref) || "修理事例";

  if (src) {
    return (
      <img
        src={src}
        alt={`${brand ? `${brand} ` : ""}${title}`}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-stone-200">
      <ImageOff className="h-8 w-8 text-neutral-400" aria-hidden="true" />
    </div>
  );
}

export function PublicCaseGalleryCard({ publicCase }: { publicCase: GalleryCard }) {
  const brand = getBrandDisplayName(publicCase);
  const workName = getWorkDisplayName(publicCase);
  const title = getTitle(publicCase, workName);
  const meta = getMeta(publicCase);

  return (
    <article className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
        <CaseImage publicCase={publicCase} />
      </div>
      <div className="p-5">
        {brand ? (
          <p className="mb-2 text-base font-bold leading-tight text-blue-950">
            {brand}
          </p>
        ) : null}
        <h2 className="mb-2 text-lg font-bold leading-snug text-neutral-900">
          {title}
        </h2>
        {meta ? (
          <p className="mb-3 text-sm font-medium text-neutral-600">{meta}</p>
        ) : null}
        <p className="mb-5 text-sm font-semibold leading-6 text-blue-900">
          {workName}
        </p>
        <Link
          href={`/cases/gallery/${publicCase.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-900"
        >
          詳しく見る
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function GalleryResults({ initialCases, total, query, brand }: {
  initialCases: GalleryCard[];
  total: number;
  query: string;
  brand: string;
}) {
  const [cases, setCases] = useState(initialCases);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [restored, setRestored] = useState(false);
  const storageKey = `public-case-gallery:${query}:${brand}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as
        { total: number; cases: GalleryCard[] } | null;
      if (saved?.total === total && Array.isArray(saved.cases) &&
        saved.cases.length >= initialCases.length && saved.cases.length <= total &&
        saved.cases[0]?.id === initialCases[0]?.id) {
        setCases(saved.cases);
      }
    } catch {
      // Storage is optional; the first page remains available.
    }
    setRestored(true);
  }, [storageKey, total, initialCases]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ total, cases })); } catch {
      // Browsing still works when storage is unavailable.
    }
  }, [storageKey, total, cases, restored]);
  async function loadMore() {
    if (loading || cases.length >= total) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ q: query, brand, offset: String(cases.length) });
      const response = await fetch(`/api/public-cases/gallery?${params}`);
      if (!response.ok) throw new Error("Failed to load cases");
      const data: { cases: GalleryCard[] } = await response.json();
      if (data.cases.length === 0) throw new Error("No more cases returned");
      setCases((current) => [...current, ...data.cases]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return <>
    <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
      {cases.map((publicCase) => <PublicCaseGalleryCard key={publicCase.id} publicCase={publicCase} />)}
    </div>
    <div className="mt-8 text-center">
      <p className="mb-3 text-sm text-neutral-600">{cases.length.toLocaleString("ja-JP")} / {total.toLocaleString("ja-JP")}件を表示</p>
      {cases.length < total ? <button type="button" onClick={loadMore} disabled={loading}
        className="min-h-11 rounded-lg border border-blue-900 px-6 text-sm font-semibold text-blue-900 transition hover:bg-blue-50 disabled:opacity-50">
        {loading ? "読み込み中…" : "もっと見る（次の30件）"}
      </button> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">読み込めませんでした。もう一度お試しください。</p> : null}
    </div>
  </>;
}
