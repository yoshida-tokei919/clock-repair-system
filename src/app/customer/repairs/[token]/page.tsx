import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { formatPartDisplay } from "@/lib/formatPartDisplay";
import { CustomerRepairAccordionItem, CustomerRepairAccordionRoot } from "./CustomerRepairAccordion";
import {
  CopyExplanationButton,
  CustomerRepairActions,
  PartnerPrivateMemo,
  PdfLinkButton,
} from "./CustomerRepairActions";
import { CustomerExportTools, CustomerGuideAmountInput } from "./CustomerExportTools";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { token: string };
};

const repairInclude = {
  customer: true,
  watch: { include: { brand: true, model: true, reference: true } },
  estimate: {
    include: {
      items: {
        include: {
          partsMaster: { select: { grade: true, notes2: true } },
        },
      },
    },
  },
  estimateDocument: { select: { id: true, estimateNumber: true, issuedDate: true } },
  customerMessages: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, body: true, createdAt: true, readAt: true, senderType: true },
  },
};

function getStatusBadgeClass(status: string) {
  if (status.includes("承認") || status.includes("作業")) return "bg-green-50 text-green-700 border-green-200";
  if (status.includes("差戻") || status.includes("保留") || status.includes("キャンセル")) return "bg-red-50 text-red-700 border-red-200";
  return "bg-orange-50 text-orange-700 border-orange-200";
}

function getEstimateItems(repair: any) {
  return repair.estimate?.items ?? [];
}

function getEstimateTotal(repair: any) {
  return getEstimateItems(repair).reduce((sum: number, item: any) => sum + item.unitPrice * (item.quantity || 1), 0);
}

function getCustomerDisplayName(repair: any) {
  return repair.endUserName?.trim() || "お客様";
}

function getWatchLine(repair: any) {
  return [
    repair.watch?.brand?.name,
    repair.watch?.model?.name,
    repair.watch?.reference?.name,
    repair.watch?.serialNumber,
  ]
    .filter(Boolean)
    .join(" ");
}

const defaultExplanation =
  "このお見積は、現在の状態を確認したうえで作成したものです。\n修理内容や金額についてご不明な点がございましたら、承認前にいつでもご質問ください。";

export default async function CustomerRepairPage({ params }: PageProps) {
  const token = params.token?.trim();
  if (!token) return notFound();

  const [documentTokenRow] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT "id"
    FROM "EstimateDocument"
    WHERE "publicToken" = ${token}
    LIMIT 1
  `;

  let repairs: any[] = [];
  let documentMeta: { id: number; estimateNumber: string; issuedDate: Date } | null = null;

  if (documentTokenRow) {
    const estimateDocument = await prisma.estimateDocument.findUnique({
      where: { id: documentTokenRow.id },
      include: {
        customer: true,
        repairs: {
          orderBy: { id: "asc" },
          include: repairInclude,
        },
      },
    });

    if (!estimateDocument || estimateDocument.repairs.length === 0) return notFound();
    repairs = estimateDocument.repairs;
    documentMeta = {
      id: estimateDocument.id,
      estimateNumber: estimateDocument.estimateNumber,
      issuedDate: estimateDocument.issuedDate,
    };
  } else {
    const [tokenRow] = await prisma.$queryRaw<{ id: number }[]>`
      SELECT "id"
      FROM "Repair"
      WHERE "publicToken" = ${token}
      LIMIT 1
    `;

    if (!tokenRow) return notFound();

    const repair = await prisma.repair.findUnique({
      where: { id: tokenRow.id },
      include: repairInclude,
    });

    if (!repair) return notFound();
    repairs = [repair];
    documentMeta = repair.estimateDocument;
  }

  const primaryRepair = repairs[0];
  const isBusiness = primaryRepair.customer.type === "business";
  const customerName = isBusiness
    ? primaryRepair.customer.companyName || primaryRepair.customer.name
    : primaryRepair.customer.name;
  const pageTotal = repairs.reduce((sum, repair) => sum + getEstimateTotal(repair), 0);
  const exportRepairs = repairs.map((repair) => {
    const amountToken = repair.publicToken || `${token}:${repair.id}`;
    const repairActionToken = repair.publicToken || token;
    const privateMemoToken = repair.publicToken || `${token}:${repair.id}`;
    return {
      amountKey: `customer-guide-amount:${amountToken}:${repair.id}`,
      privateMemoKey: `customer-repair-partner-private-memo:${privateMemoToken}`,
      partnerRef: repair.partnerRef?.trim() || "",
      inquiryNumber: repair.inquiryNumber || "",
      customerName: getCustomerDisplayName(repair),
      brand: repair.watch?.brand?.name || "",
      model: repair.watch?.model?.name || "",
      reference: repair.watch?.reference?.name || "",
      serialNumber: repair.watch?.serialNumber || "",
      shopEstimate: getEstimateTotal(repair),
      customerEstimate: "",
      explanation: repair.customerNote?.trim() || defaultExplanation,
      privateMemo: "",
    };
  });

  if (isBusiness) {
    const commentCount = repairs.filter((repair) => repair.customerMessages.length > 0).length;
    const approvedCount = repairs.filter((repair) => repair.status.includes("承認")).length;
    const pendingCount = repairs.length - approvedCount;

    return (
      <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-4 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <header className="space-y-3">
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">お見積確認ページ</h1>
                <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-sm font-bold text-blue-700">
                  B2B専用
                </span>
              </div>
              <p className="mt-3 text-base text-slate-700">共有先: {customerName} 様</p>
              {documentMeta && (
                <p className="mt-1 text-sm text-slate-500">
                  {documentMeta.estimateNumber} / {documentMeta.issuedDate.toLocaleDateString("ja-JP")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-base font-bold shadow-sm">全 {repairs.length}件</div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-base font-bold shadow-sm">未確認 {pendingCount}</div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-base font-bold shadow-sm">コメントあり {commentCount}</div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-base font-bold shadow-sm">承認済み {approvedCount}</div>
            </div>
          </header>

          <CustomerExportTools repairs={exportRepairs} />

          <CustomerRepairAccordionRoot>
            {repairs.map((repair, index) => {
              const estimateItems = getEstimateItems(repair);
              const total = getEstimateTotal(repair);
              const explanationText = repair.customerNote?.trim() || defaultExplanation;
              const repairActionToken = repair.publicToken || token;
              const amountToken = repair.publicToken || `${token}:${repair.id}`;
              const privateMemoToken = repair.publicToken || `${token}:${repair.id}`;
              const amountKey = `customer-guide-amount:${amountToken}:${repair.id}`;
              const customerDisplayName = getCustomerDisplayName(repair);
              const partnerRef = repair.partnerRef?.trim() || "";
              const watchLine = getWatchLine(repair);
              const latestMessages = repair.customerMessages.slice(0, 2).map((message: any) => ({
                ...message,
                createdAt: message.createdAt.toISOString(),
                readAt: message.readAt ? message.readAt.toISOString() : null,
                senderType: message.senderType || "partner",
              }));

              const repairHeader = (
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded-full border px-3 py-1 text-sm font-bold ${getStatusBadgeClass(repair.status)}`}>
                    {repair.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-slate-900">
                      <span className="font-bold">{customerDisplayName} 様</span>
                      {partnerRef && <span>管 {partnerRef}</span>}
                      <span>問 {repair.inquiryNumber}</span>
                    </div>
                    <div className="mt-1 truncate text-base font-medium text-slate-700">{watchLine || "-"}</div>
                  </div>
                </div>
              );

              return (
                <CustomerRepairAccordionItem key={repair.id} index={index} summary={repairHeader}>
                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-bold text-slate-900">見積内容</h2>
                      {repair.estimateDocument && <PdfLinkButton href={`/documents/estimate/${repair.estimateDocument.id}`} />}
                    </div>

                    <div className="space-y-2">
                      {estimateItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-base text-slate-500">
                          見積明細はまだありません。
                        </div>
                      ) : (
                        estimateItems.map((item: any) => (
                          <div key={item.id} className="flex items-start justify-between gap-3 text-base">
                            <div className="min-w-0">
                              <div className="font-medium">
                                {item.type === "part"
                                  ? formatPartDisplay({
                                      name: item.itemName,
                                      grade: item.partsMaster?.grade,
                                      note2: item.partsMaster?.notes2,
                                    })
                                  : item.itemName}
                              </div>
                              {item.quantity > 1 && <div className="text-sm text-slate-500">数量 {item.quantity}</div>}
                            </div>
                            <div className="shrink-0 whitespace-nowrap font-mono font-bold">
                              ¥{(item.unitPrice * (item.quantity || 1)).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-4 border-t border-slate-200 pt-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-bold text-slate-900">税込合計</div>
                        <div className="font-mono text-2xl font-bold text-blue-700">¥{total.toLocaleString()}</div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-bold text-slate-900">お客様への説明文</h2>
                      <CopyExplanationButton text={explanationText} />
                    </div>
                    <div className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-base leading-7 text-slate-800">
                      {explanationText}
                    </div>
                  </section>

                  <CustomerGuideAmountInput amountKey={amountKey} baseAmount={total} />

                  <CustomerRepairActions
                    token={repairActionToken}
                    isBusiness={isBusiness}
                    inquiryNumber={repair.inquiryNumber}
                    messages={latestMessages}
                    customerName={customerName || "取引先"}
                  />

                  <PartnerPrivateMemo token={privateMemoToken} inquiryNumber={repair.inquiryNumber} />
                </CustomerRepairAccordionItem>
              );
            })}
          </CustomerRepairAccordionRoot>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-bold text-blue-600">Estimate Confirmation</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">お見積確認ページ</h1>
          <p className="mt-1 text-sm text-slate-600">
            内容をご確認いただき、ご不明点があれば承認前にコメントでご相談ください。
          </p>
        </header>

        <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold text-slate-500">お客様</div>
              <div className="text-lg font-bold">{customerName || "お客様"}</div>
              {documentMeta && (
                <p className="mt-1 text-xs text-slate-500">
                  {documentMeta.estimateNumber} / {documentMeta.issuedDate.toLocaleDateString("ja-JP")}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-right">
              <div className="text-xs font-bold text-blue-700">税込合計</div>
              <div className="font-mono text-3xl font-bold text-blue-700">¥{pageTotal.toLocaleString()}</div>
            </div>
          </div>
        </section>

        {repairs.map((repair, index) => {
          const estimateItems = getEstimateItems(repair);
          const total = getEstimateTotal(repair);
          const watchName = [repair.watch?.brand?.name, repair.watch?.model?.name].filter(Boolean).join(" ");
          const explanationText = repair.customerNote?.trim() || "";
          const repairActionToken = repair.publicToken || token;

          return (
            <section key={repair.id} className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white p-4">
                <div className="flex items-start gap-3">
                  {repairs.length > 1 && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                      {index + 1}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-500">お問合番号</div>
                        <div className="font-mono text-xl font-bold text-slate-950">{repair.inquiryNumber}</div>
                      </div>
                      <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {repair.status}
                      </span>
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold text-slate-500">時計情報</div>
                      <div className="mt-1 text-base font-bold">{watchName || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Ref: {repair.watch?.reference?.name || "-"} / Serial: {repair.watch?.serialNumber || "-"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h2 className="text-base font-bold">見積内容</h2>
                    {repair.estimateDocument && (
                      <Link
                        href={`/documents/estimate/${repair.estimateDocument.id}`}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700"
                      >
                        PDFを見る
                      </Link>
                    )}
                  </div>

                  <div className="divide-y overflow-hidden rounded-lg border border-slate-200">
                    {estimateItems.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500">見積明細はまだありません。</div>
                    ) : (
                      estimateItems.map((item: any) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {item.type === "part"
                                ? formatPartDisplay({
                                    name: item.itemName,
                                    grade: item.partsMaster?.grade,
                                    note2: item.partsMaster?.notes2,
                                  })
                                : item.itemName}
                            </div>
                            {item.quantity > 1 && <div className="text-xs text-slate-500">数量 {item.quantity}</div>}
                          </div>
                          <div className="shrink-0 whitespace-nowrap font-mono font-bold">
                            ¥{(item.unitPrice * (item.quantity || 1)).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-right">
                  <div className="text-xs font-bold text-blue-700">このお見積の税込合計</div>
                  <div className="font-mono text-3xl font-bold text-blue-700">¥{total.toLocaleString()}</div>
                </div>

                {explanationText && (
                  <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-bold">お客様への説明文</h2>
                      <CopyExplanationButton text={explanationText} />
                    </div>
                    <div className="mt-3 whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white p-3 text-sm leading-relaxed text-slate-800">
                      {explanationText}
                    </div>
                  </section>
                )}

                <CustomerRepairActions
                  token={repairActionToken}
                  isBusiness={isBusiness}
                  inquiryNumber={repair.inquiryNumber}
                />
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
