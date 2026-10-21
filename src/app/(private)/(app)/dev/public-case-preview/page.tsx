import { readFileSync } from "node:fs";
import path from "node:path";
import { AlertTriangle, ImageOff } from "lucide-react";

type PublicCasePayload = {
  tempPublicCaseKey: string;
  sourceType: "FMP";
  sourceRepairId: string;
  repairId: null;
  brandName?: string;
  modelName?: string;
  ref?: string;
  caliber?: string;
  reviewStatus: string;
  b2bPublishStatus: string;
  b2cPublishStatus: string;
  showPriceB2b: boolean;
  showPriceB2c: boolean;
  warnings?: string[];
  excludeReasons?: string[];
};

type WorkItemPayload = {
  tempPublicCaseKey: string;
  tempWorkItemKey: string;
  sourceArea: "internal" | "external" | "outsourced";
  sourceSlot: number;
  sourceText: string;
  normalizedSourceText: string;
  isPublishable: boolean;
  reviewStatus: string;
  excludeReason?: string;
  b2bDisplayName?: string;
  b2cDisplayName?: string;
  laborPrice?: number;
  showPriceB2b: boolean;
  showPriceB2c: boolean;
};

type PartItemPayload = {
  tempPublicCaseKey: string;
  relatedWorkItemTempKey: string | null;
  sourceArea: "internal" | "external";
  sourceSlot: number;
  sourceText: string;
  normalizedSourceText: string;
  displayName?: string;
  price?: number;
  showPriceB2b: boolean;
  showPriceB2c: boolean;
  relationStatus: string;
  reviewStatus: string;
  excludeReason?: string;
};

type WarningPayload = {
  tempPublicCaseKey: string;
  code: string;
  severity: "CRITICAL" | "REVIEW" | "INFO";
  message: string;
  target?: string;
};

type PreviewCase = {
  publicCase: PublicCasePayload;
  workItems: WorkItemPayload[];
  partItems: PartItemPayload[];
  warnings: WarningPayload[];
};

const dataDir = path.join(process.cwd(), "docs/data/fmp/generated/import-dry-run");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), "utf8")) as T;
}

function formatWatchName(item: PublicCasePayload) {
  return [item.brandName, item.modelName, item.ref, item.caliber].filter(Boolean).join(" / ") || "時計情報なし";
}

function formatYen(value: number | undefined) {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

function groupByCase<T extends { tempPublicCaseKey: string }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    acc[item.tempPublicCaseKey] = acc[item.tempPublicCaseKey] ?? [];
    acc[item.tempPublicCaseKey].push(item);
    return acc;
  }, {});
}

function getPreviewCases(): PreviewCase[] {
  const publicCases = readJson<PublicCasePayload[]>("public-case-payload.sample.json");
  const workItems = groupByCase(readJson<WorkItemPayload[]>("work-item-payload.sample.json"));
  const partItems = groupByCase(readJson<PartItemPayload[]>("part-item-payload.sample.json"));
  const warnings = groupByCase(readJson<WarningPayload[]>("warning-payload.sample.json"));

  return publicCases.map((publicCase) => ({
    publicCase,
    workItems: workItems[publicCase.tempPublicCaseKey] ?? [],
    partItems: partItems[publicCase.tempPublicCaseKey] ?? [],
    warnings: warnings[publicCase.tempPublicCaseKey] ?? [],
  }));
}

function displayWorkName(item: WorkItemPayload, mode: "b2b" | "b2c") {
  if (mode === "b2c") return item.b2cDisplayName || item.b2bDisplayName || item.normalizedSourceText || item.sourceText;
  return item.b2bDisplayName || item.b2cDisplayName || item.normalizedSourceText || item.sourceText;
}

function displayPartName(item: PartItemPayload) {
  return item.displayName || item.normalizedSourceText || item.sourceText;
}

function sumVisibleLabor(items: WorkItemPayload[]) {
  return items.reduce((sum, item) => sum + (item.showPriceB2b && typeof item.laborPrice === "number" ? item.laborPrice : 0), 0);
}

function sumVisibleParts(items: PartItemPayload[]) {
  return items.reduce((sum, item) => sum + (item.showPriceB2b && typeof item.price === "number" ? item.price : 0), 0);
}

function EmptyState({ label }: { label: string }) {
  return <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">{label}</p>;
}

function PhotoPlaceholder() {
  return (
    <div className="flex min-h-28 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-slate-500">
      <div className="flex flex-col items-center gap-2 text-sm">
        <ImageOff className="h-6 w-6" aria-hidden="true" />
        <span>写真なし</span>
      </div>
    </div>
  );
}

function B2CCard({ item }: { item: PreviewCase }) {
  const visibleWorks = item.workItems.filter((work) => work.isPublishable);
  const visibleParts = item.partItems.filter((part) => part.relationStatus === "LINKED");

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">B2C表示</h3>
        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">価格非表示</span>
      </div>
      <p className="text-sm font-medium text-slate-900">{formatWatchName(item.publicCase)}</p>
      <div className="mt-3">
        <PhotoPlaceholder />
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-slate-500">作業内容</p>
          {visibleWorks.length ? (
            <ul className="space-y-1 text-sm text-slate-800">
              {visibleWorks.map((work) => (
                <li key={work.tempWorkItemKey}>{displayWorkName(work, "b2c")}</li>
              ))}
            </ul>
          ) : (
            <EmptyState label="sample内に表示対象の作業明細なし" />
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-slate-500">交換部品</p>
          {visibleParts.length ? (
            <ul className="space-y-1 text-sm text-slate-800">
              {visibleParts.map((part, index) => (
                <li key={`${part.tempPublicCaseKey}-b2c-part-${index}`}>{displayPartName(part)}</li>
              ))}
            </ul>
          ) : (
            <EmptyState label="sample内に表示対象の交換部品なし" />
          )}
        </div>
      </div>
    </section>
  );
}

function B2BCard({ item }: { item: PreviewCase }) {
  const laborTotal = sumVisibleLabor(item.workItems);
  const partsTotal = sumVisibleParts(item.partItems);
  const unlinkedParts = item.partItems.filter((part) => !part.relatedWorkItemTempKey);

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">B2B表示</h3>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">価格表示あり</span>
      </div>
      <p className="text-sm font-medium text-slate-900">{formatWatchName(item.publicCase)}</p>
      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-slate-500">作業内容 / 技術料</p>
          {item.workItems.length ? (
            <ul className="divide-y divide-slate-100 rounded border border-slate-200">
              {item.workItems.map((work) => (
                <li key={work.tempWorkItemKey} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{displayWorkName(work, "b2b")}</p>
                    <p className="text-xs text-slate-500">
                      {work.sourceArea}-{work.sourceSlot} / {work.reviewStatus}
                      {!work.isPublishable ? " / 非公開候補" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-slate-900">{work.showPriceB2b ? formatYen(work.laborPrice) : "非表示"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState label="sample内に作業明細なし" />
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase text-slate-500">部品代</p>
          {item.partItems.length ? (
            <ul className="divide-y divide-slate-100 rounded border border-slate-200">
              {item.partItems.map((part, index) => (
                <li key={`${part.tempPublicCaseKey}-b2b-part-${index}`} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{displayPartName(part)}</p>
                    <p className="text-xs text-slate-500">
                      {part.sourceArea}-{part.sourceSlot} / {part.relationStatus} / {part.reviewStatus}
                      {!part.relatedWorkItemTempKey ? " / 要確認" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-slate-900">{part.showPriceB2b ? formatYen(part.price) : "非表示"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState label="sample内に部品明細なし" />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 rounded bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">技術料</p>
            <p className="font-mono font-semibold">{formatYen(laborTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">部品代</p>
            <p className="font-mono font-semibold">{formatYen(partsTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">合計</p>
            <p className="font-mono font-semibold">{formatYen(laborTotal + partsTotal)}</p>
          </div>
        </div>

        {item.warnings.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              warning
            </p>
            <ul className="space-y-1 text-xs text-amber-900">
              {item.warnings.map((warning, index) => (
                <li key={`${warning.tempPublicCaseKey}-warning-${index}`}>
                  {warning.severity}: {warning.code}
                  {warning.target ? ` (${warning.target})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {unlinkedParts.length > 0 && (
          <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            要確認の未紐づけ部品: {unlinkedParts.length}件。価格は表示していません。
          </div>
        )}
      </div>
    </section>
  );
}

export default function PublicCasePreviewPage() {
  const previewCases = getPreviewCases();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-slate-500">開発用 / DB未接続 / sample JSON preview</p>
          <h1 className="text-2xl font-bold text-slate-950">PublicCase 表示プレビュー</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            dry-runで生成したsample payloadから、公開事例のB2C/B2B表示を確認します。DB、Prisma、Supabase、APIは使用していません。
          </p>
        </header>

        <section className="overflow-hidden rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-950">一覧</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">ブランド</th>
                  <th className="px-3 py-2">モデル</th>
                  <th className="px-3 py-2">REF</th>
                  <th className="px-3 py-2">Cal</th>
                  <th className="px-3 py-2">B2C表示プレビュー</th>
                  <th className="px-3 py-2">B2B表示プレビュー</th>
                  <th className="px-3 py-2">warning</th>
                  <th className="px-3 py-2">reviewStatus</th>
                  <th className="px-3 py-2">sourceRepairId</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewCases.map((item) => {
                  const visibleB2cWorks = item.workItems.filter((work) => work.isPublishable).map((work) => displayWorkName(work, "b2c"));
                  const visibleB2bCount =
                    item.workItems.filter((work) => work.showPriceB2b).length + item.partItems.filter((part) => part.showPriceB2b).length;
                  return (
                    <tr key={item.publicCase.tempPublicCaseKey} className={item.warnings.length ? "bg-amber-50/60" : "bg-white"}>
                      <td className="px-3 py-2 font-medium text-slate-900">{item.publicCase.brandName || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.publicCase.modelName || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.publicCase.ref || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.publicCase.caliber || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{visibleB2cWorks.slice(0, 2).join("、") || "sample明細なし"}</td>
                      <td className="px-3 py-2 text-slate-700">価格表示対象 {visibleB2bCount}件</td>
                      <td className="px-3 py-2">
                        {item.warnings.length ? (
                          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{item.warnings.length}件</span>
                        ) : (
                          <span className="text-slate-400">なし</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{item.publicCase.reviewStatus}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{item.publicCase.sourceRepairId}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-950">詳細カード</h2>
            <p className="text-sm text-slate-600">同じCaseのB2C/B2B表示を並べて確認します。</p>
          </div>
          {previewCases.map((item) => (
            <article key={`${item.publicCase.tempPublicCaseKey}-detail`} className="rounded border border-slate-200 bg-white/70 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{formatWatchName(item.publicCase)}</h3>
                  <p className="font-mono text-xs text-slate-500">sourceRepairId: {item.publicCase.sourceRepairId}</p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{item.publicCase.reviewStatus}</span>
                  {item.warnings.length > 0 && (
                    <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">warning {item.warnings.length}</span>
                  )}
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <B2CCard item={item} />
                <B2BCard item={item} />
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
