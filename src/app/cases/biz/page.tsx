import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ImageOff } from "lucide-react";
import {
  getB2BPublicCasesForBizPage,
  normalizePublicCaseSearchQuery,
  type B2BPublicCaseForBizPage,
} from "@/lib/public-cases";

export const dynamic = "force-dynamic";

type BizSearchParams = {
  q?: string | string[];
};

function text(value?: string | null): string {
  return (value ?? "").trim();
}

function getSearchQuery(searchParams?: BizSearchParams): string {
  const rawQuery = Array.isArray(searchParams?.q) ? searchParams.q[0] : searchParams?.q;
  return normalizePublicCaseSearchQuery(rawQuery);
}

function formatYen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function simplifyWorkName(value: string): string {
  return value.replace(/技術料/g, "").trim() || value;
}

function getBrandDisplayName(publicCase: B2BPublicCaseForBizPage): string {
  return text(publicCase.brandDisplayName) || text(publicCase.brandName);
}

function getWorkDisplayName(publicCase: B2BPublicCaseForBizPage): string {
  const work = publicCase.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) => text(workItem.b2bDisplayName) || text(workItem.b2cDisplayName))
    .find(Boolean);

  return work ? simplifyWorkName(work) : "修理内容確認中";
}

function getTitle(publicCase: B2BPublicCaseForBizPage, workName: string): string {
  return (
    text(publicCase.modelName) ||
    (text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "") ||
    (text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "") ||
    workName ||
    "修理事例"
  );
}

function getMeta(publicCase: B2BPublicCaseForBizPage): string {
  return [
    text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "",
    text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

function getLaborItems(publicCase: B2BPublicCaseForBizPage) {
  return publicCase.workItems
    .filter((workItem) => workItem.showPriceB2b && (workItem.laborPrice ?? 0) > 0)
    .map((workItem) => ({
      id: workItem.id,
      name: simplifyWorkName(
        text(workItem.b2bDisplayName) ||
          text(workItem.b2cDisplayName) ||
          text(workItem.normalizedWorkName),
      ),
      price: workItem.laborPrice ?? 0,
    }));
}

function getPartItems(publicCase: B2BPublicCaseForBizPage) {
  return publicCase.partItems
    .filter(
      (partItem) =>
        partItem.relatedWorkItemId !== null &&
        partItem.showPriceB2b &&
        (partItem.price ?? 0) > 0,
    )
    .map((partItem) => ({
      id: partItem.id,
      name: text(partItem.displayName) || text(partItem.normalizedSourceText),
      price: partItem.price ?? 0,
    }))
    .filter((partItem) => partItem.name);
}

function CaseImage({ publicCase }: { publicCase: B2BPublicCaseForBizPage }) {
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

function B2BPublicCaseCard({ publicCase }: { publicCase: B2BPublicCaseForBizPage }) {
  const brand = getBrandDisplayName(publicCase);
  const workName = getWorkDisplayName(publicCase);
  const title = getTitle(publicCase, workName);
  const meta = getMeta(publicCase);
  const laborItems = getLaborItems(publicCase);
  const partItems = getPartItems(publicCase);
  const total = [...laborItems, ...partItems].reduce((sum, item) => sum + item.price, 0);

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
          <p className="mb-4 text-sm font-medium text-neutral-600">{meta}</p>
        ) : null}

        <div className="mb-5 rounded-lg bg-neutral-50 p-4">
          <p className="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500">
            修理内容
          </p>
          <p className="text-sm font-semibold leading-6 text-blue-900">{workName}</p>
        </div>

        {laborItems.length > 0 || partItems.length > 0 ? (
          <div className="space-y-4 border-t border-neutral-100 pt-4">
            {laborItems.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-bold text-neutral-900">技術料</p>
                <div className="space-y-1">
                  {laborItems.map((item) => (
                    <div key={item.id} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="text-neutral-600">
                        {laborItems.length === 1 && item.name === workName ? "" : item.name}
                      </span>
                      <span className="shrink-0 font-semibold text-neutral-950">
                        {formatYen(item.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {partItems.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-bold text-neutral-900">交換部品</p>
                <div className="space-y-1">
                  {partItems.map((item) => (
                    <div key={item.id} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="text-neutral-600">{item.name}</span>
                      <span className="shrink-0 font-semibold text-neutral-950">
                        {formatYen(item.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {total > 0 ? (
              <div className="flex items-center justify-between border-t border-neutral-200 pt-3 text-base font-bold text-neutral-950">
                <span>合計</span>
                <span>{formatYen(total)}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="border-t border-neutral-100 pt-4 text-sm text-neutral-500">
            参考価格なし
          </p>
        )}

        <Link
          href={`/cases/biz/${publicCase.id}`}
          className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-neutral-900"
        >
          詳しく見る
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export default async function BizCasePage({
  searchParams,
}: {
  searchParams?: BizSearchParams;
}) {
  const session = cookies().get("b2b_session");
  const isAuthenticated = session?.value === "authenticated";

  if (!isAuthenticated) {
    redirect("/cases/biz/login");
  }

  const query = getSearchQuery(searchParams);
  const publicCases = await getB2BPublicCasesForBizPage(query);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <div className="mb-12 border-b pb-8">
        <h1 className="mb-3 flex items-center gap-3 text-2xl font-bold tracking-tight text-neutral-900">
          <span className="rounded bg-neutral-900 px-2 py-1 text-sm text-white">B2B</span>
          業者様向け修理価格事例
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-neutral-500">
          実際の修理事例をもとに、技術料と交換部品の参考価格を確認できます。
          表示価格は公開可能な明細だけに限定しています。
        </p>
      </div>

      <form
        action="/cases/biz"
        className="mb-8 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5"
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex-1">
            <label className="sr-only" htmlFor="biz-case-search">
              価格事例を検索
            </label>
            <input
              id="biz-case-search"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="ブランド・Ref・Cal・作業内容・交換部品で検索"
              className="min-h-11 w-full rounded-lg border border-neutral-300 px-4 text-sm text-neutral-900 outline-none transition focus:border-blue-900 focus:ring-2 focus:ring-blue-900/10"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-neutral-900 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              検索
            </button>
            {query ? (
              <Link
                href="/cases/biz"
                className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-500"
              >
                クリア
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {query ? (
        <p className="mb-6 text-sm font-medium text-neutral-600">
          「{query}」の検索結果: {publicCases.length}件
        </p>
      ) : null}

      {publicCases.length > 0 ? (
        <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
          {publicCases.map((publicCase) => (
            <B2BPublicCaseCard key={publicCase.id} publicCase={publicCase} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white px-5 py-8 text-center text-sm leading-7 text-neutral-500">
          {query ? (
            <>
              該当する価格事例はまだ掲載されていません。
              <br />
              個別見積りをご相談ください。
            </>
          ) : (
            "現在、掲載中の業者様向け価格事例はありません。"
          )}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-7 text-blue-900">
        <strong>ご注意</strong>
        <span className="ml-2">
          掲載内容は過去の事例です。時計の状態や部品の入手状況により、実際のお見積りは変わる場合があります。
        </span>
      </div>
    </div>
  );
}
