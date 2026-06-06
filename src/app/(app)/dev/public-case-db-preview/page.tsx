import { ArrowRight, ImageOff } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type TitleParts = {
  title: string;
  usesRef: boolean;
  usesCaliber: boolean;
  usesWork: boolean;
};

type PublicCaseWithItems = Awaited<ReturnType<typeof getPublicCasesForPreview>>[number];

const previewLimit = 20;

function isLocalDatabaseUrl(): boolean {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  return /(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(databaseUrl);
}

function text(value?: string | null): string {
  return (value ?? "").trim();
}

function positiveNumber(value?: number | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function yen(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function simplifyPublicWorkLabel(value: string): string {
  return value
    .replace(/技術料/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableLabel(value: string): string {
  return simplifyPublicWorkLabel(value).replace(/\s+/g, "");
}

function getWorkDisplayName(
  work: PublicCaseWithItems["workItems"][number],
  target: "b2c" | "b2b",
): string {
  const preferred =
    target === "b2c" ? text(work.b2cDisplayName) : text(work.b2bDisplayName);
  return preferred || text(work.b2bDisplayName) || text(work.b2cDisplayName);
}

function getSafeB2CWork(item: PublicCaseWithItems): {
  label: string;
  hasSafeWork: boolean;
} {
  const work = item.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) => getWorkDisplayName(workItem, "b2c"))
    .find(Boolean);

  return {
    label: work || "修理内容確認中",
    hasSafeWork: Boolean(work),
  };
}

function getB2BWorkLabel(item: PublicCaseWithItems): string {
  const work = item.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) => getWorkDisplayName(workItem, "b2b"))
    .find(Boolean);

  return work || getSafeB2CWork(item).label;
}

function getMetaExcluding(
  item: PublicCaseWithItems,
  used: { ref?: boolean; caliber?: boolean },
): string {
  const meta = [
    !used.ref && text(item.ref) ? `Ref. ${text(item.ref)}` : "",
    !used.caliber && text(item.caliber) ? `Cal. ${text(item.caliber)}` : "",
  ].filter(Boolean);

  return meta.join(" / ");
}

function getTitleParts(
  item: PublicCaseWithItems,
  workLabel: string,
  hasSafeWork: boolean,
): TitleParts {
  const model = text(item.modelName);
  const ref = text(item.ref);
  const caliber = text(item.caliber);

  if (model) return { title: model, usesRef: false, usesCaliber: false, usesWork: false };
  if (ref) return { title: `Ref. ${ref}`, usesRef: true, usesCaliber: false, usesWork: false };
  if (caliber) return { title: `Cal. ${caliber}`, usesRef: false, usesCaliber: true, usesWork: false };
  if (hasSafeWork) return { title: simplifyPublicWorkLabel(workLabel), usesRef: false, usesCaliber: false, usesWork: true };
  return { title: "修理事例", usesRef: false, usesCaliber: false, usesWork: false };
}

function hasB2BVisiblePrice(item: PublicCaseWithItems): boolean {
  return (
    item.workItems.some(
      (work) => work.showPriceB2b && positiveNumber(work.laborPrice) > 0,
    ) ||
    item.partItems.some(
      (part) => part.showPriceB2b && positiveNumber(part.price) > 0,
    )
  );
}

function isB2CCandidate(item: PublicCaseWithItems): boolean {
  const b2cWork = getSafeB2CWork(item);
  const hasIdentity = Boolean(text(item.modelName) || text(item.ref) || text(item.caliber));
  return b2cWork.hasSafeWork && hasIdentity && item.warningItems.length === 0;
}

async function getCounts() {
  const [publicCase, workItem, partItem, warning, image] = await Promise.all([
    prisma.publicCase.count(),
    prisma.publicCaseWorkItem.count(),
    prisma.publicCasePartItem.count(),
    prisma.publicCaseWarning.count(),
    prisma.publicCaseImage.count(),
  ]);

  return { publicCase, workItem, partItem, warning, image };
}

async function getPublicCasesForPreview() {
  return prisma.publicCase.findMany({
    orderBy: [{ receivedDate: "desc" }, { id: "asc" }],
    include: {
      workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      partItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      warningItems: true,
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
    },
  });
}

function PhotoPlaceholder() {
  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-t-lg bg-gradient-to-br from-neutral-100 to-stone-200 text-neutral-500">
      <ImageOff className="h-8 w-8 text-neutral-400" aria-hidden="true" />
    </div>
  );
}

function PublicCaseBaseCard({
  item,
  mode,
}: {
  item: PublicCaseWithItems;
  mode: "b2c" | "b2b";
}) {
  const brand = text(item.brandDisplayName) || text(item.brandName);
  const work = mode === "b2c" ? getSafeB2CWork(item) : {
    label: getB2BWorkLabel(item),
    hasSafeWork: true,
  };
  const titleParts = getTitleParts(item, work.label, work.hasSafeWork);
  const meta = getMetaExcluding(item, {
    ref: titleParts.usesRef,
    caliber: titleParts.usesCaliber,
  });
  const repairLabel = simplifyPublicWorkLabel(work.label);

  const visibleWorkItems = item.workItems.filter(
    (workItem) => workItem.showPriceB2b && positiveNumber(workItem.laborPrice) > 0,
  );
  const workRows = visibleWorkItems.map((workItem) => {
    const name = simplifyPublicWorkLabel(
      getWorkDisplayName(workItem, "b2b") || "作業名確認中",
    );
    const isDuplicateSingleWork =
      visibleWorkItems.length === 1 &&
      normalizeComparableLabel(name) === normalizeComparableLabel(repairLabel);

    return {
      name: isDuplicateSingleWork ? undefined : name,
      price: positiveNumber(workItem.laborPrice),
    };
  });
  const partRows = item.partItems
    .filter((part) => part.showPriceB2b && positiveNumber(part.price) > 0)
    .map((part) => ({
      name: text(part.displayName) || "交換部品",
      price: positiveNumber(part.price),
    }));
  const total = [...workRows, ...partRows].reduce((sum, row) => sum + row.price, 0);

  return (
    <article className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <PhotoPlaceholder />
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <p className="text-xl font-semibold uppercase leading-tight tracking-wide text-neutral-950">
            {brand}
          </p>
          <h3 className="text-base font-medium leading-snug text-neutral-800">
            {titleParts.title}
          </h3>
          {meta ? <p className="text-sm font-medium text-neutral-700">{meta}</p> : null}
        </div>

        {!titleParts.usesWork ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-500">修理内容</p>
            <p className="line-clamp-2 text-sm leading-6 text-neutral-800">
              {repairLabel}
            </p>
          </div>
        ) : null}

        {mode === "b2b" ? (
          <div className="space-y-4 border-t border-neutral-100 pt-4">
            {total > 0 ? (
              <>
                <PriceRows label="技術料" items={workRows} />
                <PriceRows label="交換部品" items={partRows} />
                <div className="flex items-center justify-between border-t border-neutral-200 pt-3 text-sm">
                  <span className="font-semibold text-neutral-800">合計</span>
                  <span className="text-base font-bold text-neutral-950">
                    {yen(total)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500">参考価格なし</p>
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-end border-t border-neutral-100 pt-4">
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white">
            詳しく見る
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  );
}

function PriceRows({
  label,
  items,
}: {
  label: string;
  items: Array<{ name?: string; price: number }>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-neutral-500">{label}</h4>
      <div className="divide-y divide-neutral-100 rounded-md border border-neutral-100">
        {items.map((item, index) => (
          <div
            key={`${item.name ?? label}-${index}`}
            className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
          >
            {item.name ? (
              <span className="min-w-0 truncate text-neutral-800">{item.name}</span>
            ) : (
              <span aria-hidden="true" />
            )}
            <span className="shrink-0 font-semibold text-neutral-950">
              {yen(item.price)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count: number;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-neutral-950">{title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{description}</p>
      </div>
      <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
        {count}件
      </span>
    </div>
  );
}

function CardGrid({
  items,
  mode,
}: {
  items: PublicCaseWithItems[];
  mode: "b2c" | "b2b";
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.slice(0, previewLimit).map((item) => (
        <PublicCaseBaseCard key={`${mode}-${item.id}`} item={item} mode={mode} />
      ))}
    </div>
  );
}

export default async function PublicCaseDbPreviewPage() {
  if (!isLocalDatabaseUrl()) {
    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-white p-6 text-red-700 shadow-sm">
          DATABASE_URL がlocal DBに見えないため、PublicCase DBプレビューを停止しました。
        </div>
      </main>
    );
  }

  const [counts, items] = await Promise.all([getCounts(), getPublicCasesForPreview()]);
  const b2cCandidates = items.filter(isB2CCandidate);
  const b2cReview = items.filter((item) => !isB2CCandidate(item));
  const b2bPriceCases = items.filter(hasB2BVisiblePrice);

  const stats = [
    { label: "PublicCase総数", value: counts.publicCase },
    { label: "WorkItem", value: counts.workItem },
    { label: "PartItem", value: counts.partItem },
    { label: "Warning", value: counts.warning },
    { label: "Image", value: counts.image },
    { label: "B2C公開候補", value: b2cCandidates.length },
    { label: "B2C要確認", value: b2cReview.length },
    { label: "B2B価格事例", value: b2bPriceCases.length },
  ];

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Development Preview
          </p>
          <div className="max-w-3xl space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">
              PublicCase DBプレビュー
            </h1>
            <p className="text-sm leading-7 text-neutral-600">
              ローカルDBのPublicCase系テーブルを読み込み、B2C/B2B共通カードUIで確認する開発用ページです。
            </p>
          </div>
        </div>

        <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-xs text-neutral-500">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-950">
                {stat.value}
              </p>
            </div>
          ))}
        </section>

        <section className="mb-12">
          <SectionHeader
            title="B2C公開候補"
            description={`先頭${previewLimit}件だけ表示します。価格は表示しません。`}
            count={b2cCandidates.length}
          />
          <CardGrid items={b2cCandidates} mode="b2c" />
        </section>

        <section className="mb-12">
          <SectionHeader
            title="B2C要確認"
            description={`先頭${previewLimit}件だけ表示します。内部管理文言は表示しません。`}
            count={b2cReview.length}
          />
          <CardGrid items={b2cReview} mode="b2c" />
        </section>

        <section className="mb-12">
          <SectionHeader
            title="B2B価格事例"
            description={`先頭${previewLimit}件だけ表示します。安全に表示できる価格だけを表示します。`}
            count={b2bPriceCases.length}
          />
          <CardGrid items={b2bPriceCases} mode="b2b" />
        </section>
      </div>
    </main>
  );
}
