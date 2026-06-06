import { ArrowRight, ImageOff } from "lucide-react";
import Link from "next/link";
import {
  getB2CBrandOptionsForGallery,
  getB2CPublicCasesForGallery,
  normalizePublicCaseBrandFilter,
  normalizePublicCaseSearchQuery,
  type B2CPublicCaseForGallery,
} from "@/lib/public-cases";

export const dynamic = "force-dynamic";

type GallerySearchParams = {
  q?: string | string[];
  brand?: string | string[];
};

function text(value?: string | null): string {
  return (value ?? "").trim();
}

function getSearchQuery(searchParams?: GallerySearchParams): string {
  const rawQuery = Array.isArray(searchParams?.q) ? searchParams.q[0] : searchParams?.q;
  return normalizePublicCaseSearchQuery(rawQuery);
}

function getBrandFilter(searchParams?: GallerySearchParams): string {
  const rawBrand = Array.isArray(searchParams?.brand)
    ? searchParams.brand[0]
    : searchParams?.brand;
  return normalizePublicCaseBrandFilter(rawBrand);
}

function getBrandDisplayName(publicCase: B2CPublicCaseForGallery): string {
  return text(publicCase.brandDisplayName) || text(publicCase.brandName);
}

function getWorkDisplayName(publicCase: B2CPublicCaseForGallery): string {
  const work = publicCase.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) => text(workItem.b2cDisplayName) || text(workItem.b2bDisplayName))
    .find(Boolean);

  return work || "修理内容確認中";
}

function getTitle(publicCase: B2CPublicCaseForGallery, workName: string): string {
  return (
    text(publicCase.modelName) ||
    (text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "") ||
    (text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "") ||
    workName ||
    "修理事例"
  );
}

function getMeta(publicCase: B2CPublicCaseForGallery): string {
  return [
    text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "",
    text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

function CaseImage({ publicCase }: { publicCase: B2CPublicCaseForGallery }) {
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

function PublicCaseGalleryCard({ publicCase }: { publicCase: B2CPublicCaseForGallery }) {
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

export default async function GalleryPage({
  searchParams,
}: {
  searchParams?: GallerySearchParams;
}) {
  const query = getSearchQuery(searchParams);
  const brand = getBrandFilter(searchParams);
  const [publicCases, brandOptions] = await Promise.all([
    getB2CPublicCasesForGallery(query, brand),
    getB2CBrandOptionsForGallery(),
  ]);
  const selectedBrandLabel =
    brandOptions.find((option) => option.value === brand)?.label || brand;
  const hasFilters = Boolean(query || brand);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <div className="mb-10 text-center">
        <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-blue-900">
          REPAIR CASES
        </p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl">
          修理事例ギャラリー
        </h1>
        <p className="leading-relaxed text-neutral-500">
          ブランドや修理内容から、実際の修理事例をご覧いただけます。
        </p>
      </div>

      <form
        action="/cases/gallery"
        className="mb-8 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.38fr)_auto]">
          <div>
            <label className="sr-only" htmlFor="case-gallery-search">
              修理事例を検索
            </label>
            <input
              id="case-gallery-search"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="ブランド・モデル・Ref・Cal・修理内容で検索"
              className="min-h-11 w-full rounded-lg border border-neutral-300 px-4 text-sm text-neutral-900 outline-none transition focus:border-blue-900 focus:ring-2 focus:ring-blue-900/10"
            />
          </div>
          <div>
            <label className="sr-only" htmlFor="case-gallery-brand">
              ブランドで絞り込み
            </label>
            <select
              id="case-gallery-brand"
              name="brand"
              defaultValue={brand}
              className="min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-900 outline-none transition focus:border-blue-900 focus:ring-2 focus:ring-blue-900/10"
            >
              <option value="">すべてのブランド</option>
              {brandOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-blue-950 px-5 text-sm font-semibold text-white transition hover:bg-blue-900"
            >
              検索
            </button>
            {hasFilters ? (
              <Link
                href="/cases/gallery"
                className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-500"
              >
                クリア
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {hasFilters ? (
        <p className="mb-6 text-sm font-medium text-neutral-600">
          {query ? `「${query}」` : ""}
          {query && brand ? " / " : ""}
          {brand ? `ブランド: ${selectedBrandLabel}` : ""}
          の検索結果: {publicCases.length}件
        </p>
      ) : null}

      {publicCases.length > 0 ? (
        <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
          {publicCases.map((publicCase) => (
            <PublicCaseGalleryCard key={publicCase.id} publicCase={publicCase} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white px-5 py-8 text-center text-sm leading-7 text-neutral-500">
          {hasFilters ? (
            <>
              該当する修理事例はまだ掲載されていません。
              <br />
              LINEで写真を送ってご相談ください。
            </>
          ) : (
            "現在、掲載中の修理事例はありません。"
          )}
        </div>
      )}

      <p className="mt-10 rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm leading-7 text-neutral-500">
        掲載内容は一例です。時計の状態や部品の入手状況により、必要な作業内容は異なります。
      </p>
    </div>
  );
}
