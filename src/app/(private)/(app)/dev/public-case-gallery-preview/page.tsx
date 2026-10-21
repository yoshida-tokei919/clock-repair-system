import { readFileSync } from "node:fs";
import path from "node:path";
import { ArrowRight, EyeOff, ImageOff } from "lucide-react";

type PublicCasePayload = {
  tempPublicCaseKey: string;
  sourceType: "FMP" | "WEB_APP";
  sourceRepairId?: string | null;
  repairId?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  ref?: string | null;
  caliber?: string | null;
  reviewStatus?: string | null;
  b2bPublishStatus?: string | null;
  b2cPublishStatus?: string | null;
  showPriceB2b?: boolean;
  showPriceB2c?: boolean;
  warnings?: string[];
  excludeReasons?: string[];
};

type WorkItemPayload = {
  tempPublicCaseKey: string;
  tempWorkItemKey: string;
  sourceArea: "internal" | "external" | "outsourced";
  sourceSlot: number;
  sourceText?: string | null;
  normalizedSourceText?: string | null;
  isPublishable?: boolean;
  reviewStatus?: string | null;
  excludeReason?: string | null;
  b2bDisplayName?: string | null;
  b2cDisplayName?: string | null;
  laborPrice?: number | null;
  showPriceB2b?: boolean;
  showPriceB2c?: boolean;
};

type PartItemPayload = {
  tempPublicCaseKey: string;
  relatedWorkItemTempKey?: string | null;
  sourceArea: "internal" | "external";
  sourceSlot: number;
  sourceText?: string | null;
  normalizedSourceText?: string | null;
  displayName?: string | null;
  price?: number | null;
  showPriceB2b?: boolean;
  showPriceB2c?: boolean;
  relationStatus?: string | null;
  reviewStatus?: string | null;
  excludeReason?: string | null;
};

type WarningPayload = {
  tempPublicCaseKey: string;
  code: string;
  severity: "critical" | "review" | "info";
  message: string;
  target?: string | null;
};

type GalleryCase = {
  publicCase: PublicCasePayload;
  workItems: WorkItemPayload[];
  partItems: PartItemPayload[];
  warnings: WarningPayload[];
};

type B2CCategory = "candidate" | "review" | "hidden";

type ReviewFlags = {
  noPhoto: boolean;
  hasWarning: boolean;
  unlinkedPartItem: boolean;
  modelMissing: boolean;
  noSafeWork: boolean;
  suspiciousWorkName: boolean;
  weakInformation: boolean;
  noDisplayableParts: boolean;
};

type B2CDisplayCase = {
  item: GalleryCase;
  category: B2CCategory;
  title: string;
  meta: string;
  workLabel: string;
  titleUsesWork: boolean;
  hasSafeWork: boolean;
  flags: ReviewFlags;
  score: number;
};

type TitleParts = {
  title: string;
  usesRef: boolean;
  usesCaliber: boolean;
  usesWork: boolean;
};

const dataDir = path.join(
  process.cwd(),
  "docs",
  "data",
  "fmp",
  "generated",
  "import-dry-run",
);

const blockedB2CWords = [
  "技術料",
  "○○",
  "コウカンギジュツリョウ",
  "ハリトリツケ",
  "トリツケ",
  "シュウリ",
  "チョウセイ",
  "作業内容未設定",
  "表示対象の作業明細なし",
  "sample内に表示対象なし",
  "価格表示対象なし",
];

const subtleCheckLabels: Record<keyof ReviewFlags, string> = {
  noPhoto: "写真準備中",
  hasWarning: "要確認",
  unlinkedPartItem: "部品確認",
  modelMissing: "モデル確認",
  noSafeWork: "作業名確認",
  suspiciousWorkName: "表示名確認",
  weakInformation: "情報少なめ",
  noDisplayableParts: "部品表示なし",
};

function readJson<T>(fileName: string): T[] {
  const filePath = path.join(dataDir, fileName);
  return JSON.parse(readFileSync(filePath, "utf8")) as T[];
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

function hasReadingKana(value: string): boolean {
  const normalized = value.trim();
  const hasKanjiOrHiragana = /[一-龠ぁ-ん]/.test(normalized);
  const hasLongKatakana = /[ァ-ヶー]{4,}/.test(normalized);
  const safeKatakanaOnly = /^(オーバーホール|クロノグラフ|ムーブメント|カレンダー|リューズ|ガラス|ゼンマイ)$/.test(
    normalized,
  );

  return hasKanjiOrHiragana && hasLongKatakana && !safeKatakanaOnly;
}

function hasSuspiciousDisplayText(value?: string | null): boolean {
  const displayName = text(value);
  if (!displayName) return true;
  if (blockedB2CWords.some((word) => displayName.includes(word))) return true;
  return hasReadingKana(displayName);
}

function getWorkDisplayName(work: WorkItemPayload, target: "b2c" | "b2b"): string {
  const preferred =
    target === "b2c" ? text(work.b2cDisplayName) : text(work.b2bDisplayName);
  return preferred || text(work.b2bDisplayName) || text(work.b2cDisplayName);
}

function getSafeB2CWork(item: GalleryCase): {
  label: string;
  hasSafeWork: boolean;
  suspiciousWorkName: boolean;
} {
  const publishableWorks = item.workItems.filter((work) => work.isPublishable);
  const safeWork = publishableWorks
    .map((work) => getWorkDisplayName(work, "b2c"))
    .find((name) => !hasSuspiciousDisplayText(name));

  const hasSuspiciousWorkName = publishableWorks.some((work) =>
    hasSuspiciousDisplayText(getWorkDisplayName(work, "b2c")),
  );

  return {
    label: safeWork || "修理内容確認中",
    hasSafeWork: Boolean(safeWork),
    suspiciousWorkName: hasSuspiciousWorkName && !safeWork,
  };
}

function getB2BWorkLabel(item: GalleryCase): string {
  const work = item.workItems
    .filter((workItem) => workItem.isPublishable)
    .map((workItem) => getWorkDisplayName(workItem, "b2b"))
    .find(Boolean);

  return work || getSafeB2CWork(item).label;
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

function getMeta(publicCase: PublicCasePayload): string {
  const meta = [
    text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "",
    text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "",
  ].filter(Boolean);

  return meta.join(" / ");
}

function getMetaExcluding(
  publicCase: PublicCasePayload,
  used: { ref?: boolean; caliber?: boolean },
): string {
  const meta = [
    !used.ref && text(publicCase.ref) ? `Ref. ${text(publicCase.ref)}` : "",
    !used.caliber && text(publicCase.caliber) ? `Cal. ${text(publicCase.caliber)}` : "",
  ].filter(Boolean);

  return meta.join(" / ");
}

function getB2CTitleParts(
  publicCase: PublicCasePayload,
  workLabel: string,
  hasSafeWork: boolean,
): TitleParts {
  const model = text(publicCase.modelName);
  const ref = text(publicCase.ref);
  const caliber = text(publicCase.caliber);

  if (model) return { title: model, usesRef: false, usesCaliber: false, usesWork: false };
  if (ref) return { title: `Ref. ${ref}`, usesRef: true, usesCaliber: false, usesWork: false };
  if (caliber) return { title: `Cal. ${caliber}`, usesRef: false, usesCaliber: true, usesWork: false };
  if (hasSafeWork) return { title: workLabel, usesRef: false, usesCaliber: false, usesWork: true };
  return { title: "修理事例", usesRef: false, usesCaliber: false, usesWork: false };
}

function getB2BTitleParts(item: GalleryCase): TitleParts {
  const publicCase = item.publicCase;
  const model = text(publicCase.modelName);
  const ref = text(publicCase.ref);
  const caliber = text(publicCase.caliber);
  const workLabel = getB2BWorkLabel(item);

  if (model) return { title: model, usesRef: false, usesCaliber: false, usesWork: false };
  if (ref) return { title: `Ref. ${ref}`, usesRef: true, usesCaliber: false, usesWork: false };
  if (caliber) return { title: `Cal. ${caliber}`, usesRef: false, usesCaliber: true, usesWork: false };
  if (workLabel && workLabel !== "修理内容確認中") {
    return {
      title: simplifyPublicWorkLabel(workLabel),
      usesRef: false,
      usesCaliber: false,
      usesWork: true,
    };
  }
  return { title: "修理事例", usesRef: false, usesCaliber: false, usesWork: false };
}

function hasPhoto(_item: GalleryCase): boolean {
  return false;
}

function hasB2BVisiblePrice(item: GalleryCase): boolean {
  return (
    item.workItems.some(
      (work) => work.showPriceB2b && positiveNumber(work.laborPrice) > 0,
    ) ||
    item.partItems.some(
      (part) => part.showPriceB2b && positiveNumber(part.price) > 0,
    )
  );
}

function getVisibleB2BWorkItems(item: GalleryCase): WorkItemPayload[] {
  return item.workItems.filter(
    (work) => work.showPriceB2b && positiveNumber(work.laborPrice) > 0,
  );
}

function getVisibleB2BPartItems(item: GalleryCase): PartItemPayload[] {
  return item.partItems.filter(
    (part) => part.showPriceB2b && positiveNumber(part.price) > 0,
  );
}

function getUnlinkedPartItems(item: GalleryCase): PartItemPayload[] {
  return item.partItems.filter((part) => !part.relatedWorkItemTempKey);
}

function classifyB2CCase(item: GalleryCase): B2CDisplayCase {
  const publicCase = item.publicCase;
  const work = getSafeB2CWork(item);
  const noPhoto = !hasPhoto(item);
  const modelMissing = !text(publicCase.modelName);
  const hasWarning = item.warnings.length > 0 || (publicCase.warnings ?? []).length > 0;
  const unlinkedPartItem = getUnlinkedPartItems(item).length > 0;
  const noDisplayableParts =
    item.partItems.length > 0 &&
    !item.partItems.some((part) => text(part.displayName) && !part.excludeReason);
  const weakInformation =
    modelMissing && !text(publicCase.ref) && !text(publicCase.caliber);

  const flags: ReviewFlags = {
    noPhoto,
    hasWarning,
    unlinkedPartItem,
    modelMissing,
    noSafeWork: !work.hasSafeWork,
    suspiciousWorkName: work.suspiciousWorkName,
    weakInformation,
    noDisplayableParts,
  };

  const hidden =
    (!work.hasSafeWork && modelMissing && !text(publicCase.ref)) ||
    (work.suspiciousWorkName && modelMissing && noPhoto) ||
    (!work.hasSafeWork && weakInformation);

  const candidate =
    !hidden &&
    work.hasSafeWork &&
    !work.suspiciousWorkName &&
    !hasWarning &&
    (!modelMissing || Boolean(text(publicCase.ref)));

  const category: B2CCategory = candidate ? "candidate" : hidden ? "hidden" : "review";
  const score =
    (hasPhoto(item) ? 64 : 0) +
    (!hasWarning ? 32 : 0) +
    (!modelMissing ? 16 : 0) +
    (work.hasSafeWork ? 8 : 0) +
    (text(publicCase.ref) ? 4 : 0) +
    (text(publicCase.caliber) ? 2 : 0);

  const titleParts = getB2CTitleParts(publicCase, work.label, work.hasSafeWork);

  return {
    item,
    category,
    title: titleParts.title,
    meta: getMetaExcluding(publicCase, {
      ref: titleParts.usesRef,
      caliber: titleParts.usesCaliber,
    }),
    workLabel: work.label,
    titleUsesWork: titleParts.usesWork,
    hasSafeWork: work.hasSafeWork,
    flags,
    score,
  };
}

function byPreviewPriority(a: B2CDisplayCase, b: B2CDisplayCase): number {
  return b.score - a.score || a.title.localeCompare(b.title, "ja");
}

function getGalleryCases(): GalleryCase[] {
  const publicCases = readJson<PublicCasePayload>("public-case-payload.sample.json");
  const workItems = readJson<WorkItemPayload>("work-item-payload.sample.json");
  const partItems = readJson<PartItemPayload>("part-item-payload.sample.json");
  const warnings = readJson<WarningPayload>("warning-payload.sample.json");

  return publicCases.map((publicCase) => ({
    publicCase,
    workItems: workItems.filter(
      (workItem) => workItem.tempPublicCaseKey === publicCase.tempPublicCaseKey,
    ),
    partItems: partItems.filter(
      (partItem) => partItem.tempPublicCaseKey === publicCase.tempPublicCaseKey,
    ),
    warnings: warnings.filter(
      (warning) => warning.tempPublicCaseKey === publicCase.tempPublicCaseKey,
    ),
  }));
}

function FlagBadges({ flags }: { flags: ReviewFlags }) {
  const labels = Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([key]) => subtleCheckLabels[key as keyof ReviewFlags])
    .filter(Boolean)
    .slice(0, 3);

  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function PhotoPlaceholder() {
  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-t-lg bg-gradient-to-br from-neutral-100 to-stone-200 text-neutral-500">
      <ImageOff className="h-8 w-8 text-neutral-400" aria-hidden="true" />
    </div>
  );
}

function B2CCard({ displayCase }: { displayCase: B2CDisplayCase }) {
  const { item, title, meta, workLabel, titleUsesWork } = displayCase;
  const brand = text(item.publicCase.brandName) || "WATCH";

  return (
    <article className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <PhotoPlaceholder />
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <p className="text-xl font-semibold uppercase leading-tight tracking-wide text-neutral-950">
            {brand}
          </p>
          <h3 className="text-base font-medium leading-snug text-neutral-800">
            {title}
          </h3>
          {meta ? <p className="text-sm font-medium text-neutral-700">{meta}</p> : null}
        </div>

        {!titleUsesWork ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-500">作業内容</p>
            <p
              className={`line-clamp-2 text-sm leading-6 ${
                displayCase.hasSafeWork ? "text-neutral-800" : "text-neutral-500"
              }`}
            >
              {workLabel}
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
          <span className="text-xs text-neutral-500">修理事例</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white">
            詳しく見る
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
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

function B2CGrid({
  items,
  emptyText,
}: {
  items: B2CDisplayCase[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map((displayCase) => (
        <B2CCard
          key={displayCase.item.publicCase.tempPublicCaseKey}
          displayCase={displayCase}
        />
      ))}
    </div>
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
            key={`${item.name}-${index}`}
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

function B2BPriceCard({ item }: { item: GalleryCase }) {
  const rawRepairLabel = getB2BWorkLabel(item);
  const repairLabel = simplifyPublicWorkLabel(rawRepairLabel);
  const visibleWorkItems = getVisibleB2BWorkItems(item);
  const workRows = visibleWorkItems.map((work) => {
    const name = simplifyPublicWorkLabel(getWorkDisplayName(work, "b2b") || "作業名確認中");
    const isDuplicateSingleWork =
      visibleWorkItems.length === 1 &&
      normalizeComparableLabel(name) === normalizeComparableLabel(repairLabel);

    return {
      name: isDuplicateSingleWork ? undefined : name,
      price: positiveNumber(work.laborPrice),
    };
  });
  const partRows = getVisibleB2BPartItems(item).map((part) => {
    const name = text(part.displayName) || "部品名確認中";
    return {
      name,
      price: positiveNumber(part.price),
    };
  });
  const total = [...workRows, ...partRows].reduce((sum, row) => sum + row.price, 0);
  const hasVisiblePrice = total > 0;
  const titleParts = getB2BTitleParts(item);
  const meta = getMetaExcluding(item.publicCase, {
    ref: titleParts.usesRef,
    caliber: titleParts.usesCaliber,
  });

  return (
    <article className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <PhotoPlaceholder />
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <p className="text-xl font-semibold uppercase leading-tight tracking-wide text-neutral-950">
            {text(item.publicCase.brandName) || "WATCH"}
          </p>
          <h3 className="text-base font-medium text-neutral-800">
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

        <div className="space-y-4 border-t border-neutral-100 pt-4">
          {hasVisiblePrice ? (
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

export default function PublicCaseGalleryPreviewPage() {
  const cases = getGalleryCases();
  const b2cCases = cases.map(classifyB2CCase).sort(byPreviewPriority);
  const b2cCandidates = b2cCases.filter((item) => item.category === "candidate");
  const b2cReview = b2cCases.filter((item) => item.category === "review");
  const b2cHidden = b2cCases.filter((item) => item.category === "hidden");
  const b2bPriceCases = cases.filter(hasB2BVisiblePrice);
  const warningCount = cases.filter(
    (item) => item.warnings.length > 0 || (item.publicCase.warnings ?? []).length > 0,
  ).length;

  const stats = [
    { label: "sample総数", value: cases.length },
    { label: "B2C表示候補", value: b2cCandidates.length },
    { label: "B2C要確認", value: b2cReview.length },
    { label: "B2C非表示候補", value: b2cHidden.length },
    { label: "B2B価格表示候補", value: b2bPriceCases.length },
    { label: "warningあり", value: warningCount },
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
              FMP PublicCase ギャラリープレビュー
            </h1>
            <p className="text-sm leading-7 text-neutral-600">
              sample JSONからB2C公開候補、B2C要確認、B2B価格事例を分けて表示する確認用ページです。本番公開ページやDBには接続していません。
            </p>
          </div>
        </div>

        <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
            title="B2C公開候補カード"
            description="一般公開の修理事例として見せやすい候補です。価格は表示しません。"
            count={b2cCandidates.length}
          />
          <B2CGrid
            items={b2cCandidates}
            emptyText="現在のsampleでは、B2C公開候補としてそのまま見せやすい事例はありません。"
          />
        </section>

        <section className="mb-12">
          <SectionHeader
            title="B2C要確認カード"
            description="モデル名、作業名、写真、warningなどを公開前に確認したい候補です。"
            count={b2cReview.length}
          />
          <B2CGrid items={b2cReview} emptyText="B2C要確認の事例はありません。" />
        </section>

        <section className="mb-12">
          <SectionHeader
            title="B2B価格事例カード"
            description="業者様向けに価格表示できる明細だけを表形式で確認します。"
            count={b2bPriceCases.length}
          />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {b2bPriceCases.map((item) => (
              <B2BPriceCard
                key={item.publicCase.tempPublicCaseKey}
                item={item}
              />
            ))}
          </div>
        </section>

        <details className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-800">
            <EyeOff className="h-4 w-4" aria-hidden="true" />
            B2C非表示候補を確認する ({b2cHidden.length}件)
          </summary>
          <div className="mt-5">
            <B2CGrid
              items={b2cHidden}
              emptyText="B2C非表示候補の事例はありません。"
            />
          </div>
        </details>
      </div>
    </main>
  );
}
