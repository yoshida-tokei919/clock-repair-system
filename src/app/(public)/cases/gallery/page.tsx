import Link from "next/link";
import { GalleryResults } from "./gallery-results";
import { JsonLd, breadcrumbJsonLd, fixedPageSeo } from "@/lib/seo";
import {
  getB2CBrandOptionsForGallery,
  getB2CPublishedCaseCount,
  getB2CPublicCasesPage,
  normalizePublicCaseBrandFilter,
  normalizePublicCaseSearchQuery,
  toGalleryCard,
} from "@/lib/public-cases";

export const dynamic = "force-dynamic";
export const metadata = fixedPageSeo["/cases/gallery"].metadata;

type GallerySearchParams = {
  q?: string | string[];
  brand?: string | string[];
};

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

export default async function GalleryPage({
  searchParams,
}: {
  searchParams?: Promise<GallerySearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = getSearchQuery(resolvedSearchParams);
  const brand = getBrandFilter(resolvedSearchParams);
  const hasFilters = Boolean(query || brand);
  const [result, brandOptions, publishedTotal] = await Promise.all([
    getB2CPublicCasesPage(query, brand),
    getB2CBrandOptionsForGallery(),
    hasFilters ? getB2CPublishedCaseCount() : Promise.resolve(null),
  ]);
  const selectedBrandLabel =
    brandOptions.find((option) => option.value === brand)?.label || brand;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <JsonLd data={breadcrumbJsonLd("/cases/gallery")} />
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

      <p className="mb-6 text-lg font-bold text-blue-950">公開中の修理事例 {(publishedTotal ?? result.total).toLocaleString("ja-JP")}件</p>

      {hasFilters ? (
        <p className="mb-6 text-sm font-medium text-neutral-600">
          {query ? `「${query}」` : ""}
          {query && brand ? " / " : ""}
          {brand ? `ブランド: ${selectedBrandLabel}` : ""}
          の検索結果: {result.total.toLocaleString("ja-JP")}件
        </p>
      ) : null}

      {result.cases.length > 0 ? (
        <GalleryResults key={`${query}:${brand}`} initialCases={result.cases.map(toGalleryCard)} total={result.total} query={query} brand={brand} />
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
