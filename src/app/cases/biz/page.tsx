import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ImageOff } from "lucide-react";
import {
  getB2BPublicCasesForBizPage,
  normalizePublicCasePage,
  normalizePublicCasePageSize,
  normalizePublicCaseSearchQuery,
  type PublicCaseBizFilters,
  type B2BPublicCaseForBizPage,
} from "@/lib/public-cases";

export const dynamic = "force-dynamic";

type BizSearchParams = Partial<Record<keyof PublicCaseBizFilters | "page" | "size", string | string[]>>;
const fields: { name: keyof PublicCaseBizFilters; label: string; placeholder: string }[] = [
  { name: "q", label: "フリーワード", placeholder: "時計・作業・部品を横断検索" },
  { name: "brand", label: "ブランド", placeholder: "ブランド" },
  { name: "model", label: "モデル", placeholder: "モデル" },
  { name: "ref", label: "Ref", placeholder: "Ref" },
  { name: "cal", label: "Cal", placeholder: "Cal" },
  { name: "work", label: "修理・症状・作業", placeholder: "修理内容・症状・部品" },
];
function first(value?: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function text(value?: string | null) { return (value ?? "").trim(); }
function formatYen(value: number) { return `¥${value.toLocaleString("ja-JP")}`; }
function workName(value: string) { return value.replace(/技術料/g, "").trim() || value; }
function visiblePrice(publicCase: B2BPublicCaseForBizPage) {
  const labor = publicCase.workItems
    .filter((item) => item.showPriceB2b && (item.laborPrice ?? 0) > 0)
    .reduce((sum, item) => sum + (item.laborPrice ?? 0), 0);
  const parts = publicCase.partItems
    .filter((item) => item.relatedWorkItemId !== null && item.showPriceB2b && (item.price ?? 0) > 0 &&
      (text(item.displayName) || text(item.normalizedSourceText)))
    .reduce((sum, item) => sum + (item.price ?? 0), 0);
  return labor + parts;
}
function pageHref(filters: PublicCaseBizFilters, page: number, size: number) {
  const params = new URLSearchParams();
  for (const field of fields) if (filters[field.name]) params.set(field.name, filters[field.name]);
  params.set("page", String(page));
  params.set("size", String(size));
  return `/cases/biz?${params}`;
}

export default async function BizCasePage({ searchParams }: { searchParams?: Promise<BizSearchParams> }) {
  const session = (await cookies()).get("b2b_session");
  if (session?.value !== "authenticated") redirect("/cases/biz/login");

  const params = await searchParams;
  const filters = Object.fromEntries(fields.map((field) =>
    [field.name, normalizePublicCaseSearchQuery(first(params?.[field.name]))])) as PublicCaseBizFilters;
  const size = normalizePublicCasePageSize(first(params?.size));
  const result = await getB2BPublicCasesForBizPage(filters, normalizePublicCasePage(first(params?.page)), size);
  const hasFilters = fields.some((field) => filters[field.name]);
  const from = result.total ? (result.page - 1) * size + 1 : 0;
  const to = Math.min(result.page * size, result.total);
  const pages = Math.ceil(result.total / size);

  return <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
    <div className="mb-8 border-b pb-6">
      <h1 className="mb-3 flex items-center gap-3 text-2xl font-bold text-neutral-900">
        <span className="rounded bg-neutral-900 px-2 py-1 text-sm text-white">B2B</span>業者様向け修理価格事例
      </h1>
      <p className="text-sm leading-7 text-neutral-500">公開事例から対応した時計と参考価格を検索できます。表示価格は公開可能な明細に限ります。</p>
    </div>
    <form action="/cases/biz" className="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => <label key={field.name} className="text-sm font-semibold text-neutral-700">
          {field.label}
          <input name={field.name} type="search" defaultValue={filters[field.name]} placeholder={field.placeholder}
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm font-normal text-neutral-900 focus:border-blue-900 focus:outline-none" />
        </label>)}
      </div>
      <input type="hidden" name="size" value={size} />
      <div className="mt-4 flex gap-2">
        <button type="submit" className="min-h-11 rounded-lg bg-neutral-900 px-6 text-sm font-semibold text-white">検索</button>
        {hasFilters ? <Link href="/cases/biz" className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 text-sm font-semibold text-neutral-700">クリア</Link> : null}
      </div>
    </form>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="font-bold text-neutral-900">{result.total.toLocaleString("ja-JP")}件中 {from.toLocaleString("ja-JP")}〜{to.toLocaleString("ja-JP")}件</p>
      <div className="flex items-center gap-2">表示件数
        {[30, 50, 100].map((count) => <Link key={count} href={pageHref(filters, 1, count)}
          aria-current={size === count ? "page" : undefined}
          className={`rounded border px-3 py-2 font-semibold ${size === count ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700"}`}>{count}</Link>)}
      </div>
    </div>
    {result.cases.length ? <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="min-w-[900px] w-full text-left text-sm">
        <thead className="bg-neutral-100 text-neutral-700"><tr>
          {['画像','ブランド','モデル','Ref','Cal','修理内容','参考価格','詳細'].map((heading) =>
            <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3">{heading}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-neutral-200">{result.cases.map((publicCase) => {
          const href = `/cases/biz/${publicCase.id}`;
          const image = publicCase.images[0];
          const repair = publicCase.workItems.filter((item) => item.isPublishable)
            .map((item) => text(item.b2bDisplayName) || text(item.b2cDisplayName)).find(Boolean);
          const price = visiblePrice(publicCase);
          return <tr key={publicCase.id} className="hover:bg-blue-50/50">
            <td className="p-2"><Link href={href} aria-label="事例の詳細を見る" className="flex h-14 w-16 items-center justify-center overflow-hidden rounded bg-neutral-100">
              {text(image?.url) ? <img src={text(image?.url)} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-neutral-400" aria-hidden="true" />}
            </Link></td>
            <td className="px-3 py-3 font-semibold text-blue-950">{text(publicCase.brandDisplayName) || text(publicCase.brandName) || '—'}</td>
            <td className="px-3 py-3">{text(publicCase.modelName) || '—'}</td>
            <td className="px-3 py-3">{text(publicCase.ref) || '—'}</td>
            <td className="px-3 py-3">{text(publicCase.caliber) || '—'}</td>
            <td className="min-w-40 px-3 py-3">{repair ? workName(repair) : '修理内容確認中'}</td>
            <td className="whitespace-nowrap px-3 py-3 font-semibold">{price > 0 ? formatYen(price) : '参考価格なし'}</td>
            <td className="px-3 py-3"><Link href={href} className="whitespace-nowrap font-semibold text-blue-900 underline">詳しく見る</Link></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <div className="rounded-lg border border-neutral-200 bg-white px-5 py-8 text-center text-sm text-neutral-500">
      {hasFilters ? '該当する価格事例はまだ掲載されていません。個別見積りをご相談ください。' : '現在、掲載中の業者様向け価格事例はありません。'}
    </div>}
    {pages > 1 ? <nav aria-label="ページ切り替え" className="mt-6 flex items-center justify-center gap-4 text-sm font-semibold">
      {result.page > 1 ? <Link href={pageHref(filters, result.page - 1, size)} className="rounded border px-4 py-2">前へ</Link> : null}
      <span>{result.page} / {pages}ページ</span>
      {result.page < pages ? <Link href={pageHref(filters, result.page + 1, size)} className="rounded border px-4 py-2">次へ</Link> : null}
    </nav> : null}
    <p className="mt-8 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-7 text-blue-900">掲載内容は過去の事例です。時計の状態や部品の入手状況により、実際のお見積りは変わる場合があります。</p>
  </div>;
}
