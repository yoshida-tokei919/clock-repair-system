import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ImageOff } from "lucide-react";
import {
  getB2BPublicCaseDetail,
  type B2BPublicCaseForBizPage,
} from "@/lib/public-cases";

export const dynamic = "force-dynamic";

function text(value?: string | null): string {
  return (value ?? "").trim();
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

function getWorkNames(publicCase: B2BPublicCaseForBizPage): string[] {
  const names = publicCase.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) => text(workItem.b2bDisplayName) || text(workItem.b2cDisplayName))
    .filter(Boolean)
    .map(simplifyWorkName)
    .filter(Boolean);

  return Array.from(new Set(names));
}

function getTitle(publicCase: B2BPublicCaseForBizPage, fallbackWorkName: string): string {
  return (
    text(publicCase.modelName) ||
    (text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "") ||
    (text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "") ||
    fallbackWorkName ||
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

function DetailImage({ publicCase }: { publicCase: B2BPublicCaseForBizPage }) {
  const image = publicCase.images[0];
  const src = text(image?.url);
  const brand = getBrandDisplayName(publicCase);
  const title = text(publicCase.modelName) || text(publicCase.ref) || "修理事例";

  if (src) {
    return (
      <img
        src={src}
        alt={`${brand ? `${brand} ` : ""}${title}`}
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-stone-200">
      <ImageOff className="h-10 w-10 text-neutral-400" aria-hidden="true" />
    </div>
  );
}

export default async function BizPublicCaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = cookies().get("b2b_session");
  const isAuthenticated = session?.value === "authenticated";

  if (!isAuthenticated) {
    redirect("/cases/biz/login");
  }

  const publicCase = await getB2BPublicCaseDetail(params.id);
  if (!publicCase) {
    notFound();
  }

  const brand = getBrandDisplayName(publicCase);
  const workNames = getWorkNames(publicCase);
  const primaryWorkName = workNames[0] ?? "修理内容確認中";
  const title = getTitle(publicCase, primaryWorkName);
  const meta = getMeta(publicCase);
  const laborItems = getLaborItems(publicCase);
  const partItems = getPartItems(publicCase);
  const total = [...laborItems, ...partItems].reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <div className="mb-8">
        <Link
          href="/cases/biz"
          className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 hover:text-blue-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          業者様向け価格事例一覧へ戻る
        </Link>
      </div>

      <article className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="aspect-[4/3] bg-neutral-100 lg:aspect-auto">
            <DetailImage publicCase={publicCase} />
          </div>

          <div className="space-y-7 p-6 md:p-8">
            <header className="space-y-3">
              {brand ? (
                <p className="text-xl font-bold leading-tight text-blue-950">
                  {brand}
                </p>
              ) : null}
              <h1 className="text-2xl font-bold leading-snug text-neutral-950 md:text-3xl">
                {title}
              </h1>
              {meta ? (
                <p className="text-base font-medium text-neutral-700">{meta}</p>
              ) : null}
            </header>

            <section className="space-y-3 border-t border-neutral-100 pt-6">
              <h2 className="text-sm font-semibold tracking-[0.16em] text-neutral-500">
                修理内容
              </h2>
              <ul className="space-y-2 text-base leading-7 text-neutral-900">
                {workNames.length > 0 ? (
                  workNames.map((name) => <li key={name}>{name}</li>)
                ) : (
                  <li>{primaryWorkName}</li>
                )}
              </ul>
            </section>

            {laborItems.length > 0 || partItems.length > 0 ? (
              <section className="space-y-5 border-t border-neutral-100 pt-6">
                {laborItems.length > 0 ? (
                  <div>
                    <h2 className="mb-3 text-sm font-semibold tracking-[0.16em] text-neutral-500">
                      技術料
                    </h2>
                    <div className="space-y-2">
                      {laborItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-baseline justify-between gap-5 text-base"
                        >
                          <span className="text-neutral-700">
                            {laborItems.length === 1 && item.name === primaryWorkName
                              ? ""
                              : item.name}
                          </span>
                          <span className="shrink-0 font-bold text-neutral-950">
                            {formatYen(item.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {partItems.length > 0 ? (
                  <div>
                    <h2 className="mb-3 text-sm font-semibold tracking-[0.16em] text-neutral-500">
                      交換部品
                    </h2>
                    <div className="space-y-2">
                      {partItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-baseline justify-between gap-5 text-base"
                        >
                          <span className="text-neutral-700">{item.name}</span>
                          <span className="shrink-0 font-bold text-neutral-950">
                            {formatYen(item.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {total > 0 ? (
                  <div className="flex items-center justify-between border-t border-neutral-200 pt-4 text-lg font-bold text-neutral-950">
                    <span>合計</span>
                    <span>{formatYen(total)}</span>
                  </div>
                ) : null}
              </section>
            ) : (
              <p className="border-t border-neutral-100 pt-6 text-sm leading-7 text-neutral-500">
                参考価格なし
              </p>
            )}

            <p className="border-t border-neutral-100 pt-6 text-sm leading-7 text-neutral-500">
              掲載内容は過去の事例です。時計の状態や部品の入手状況により、実際のお見積りは変わる場合があります。
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
