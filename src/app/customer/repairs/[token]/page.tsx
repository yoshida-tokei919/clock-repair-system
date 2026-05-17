import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { formatPartDisplay } from "@/lib/formatPartDisplay";
import { CustomerRepairAccordionItem, CustomerRepairAccordionRoot } from "./CustomerRepairAccordion";
import { CustomerRepairActions, CopyExplanationButton, PartnerPrivateMemo } from "./CustomerRepairActions";

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
    select: { id: true, body: true, createdAt: true },
  },
};

function getStatusBadgeClass(status: string) {
  if (status === "保留" || status === "キャンセル") return "bg-red-50 text-red-700 border-red-200";
  if (status === "承認待ち") return "bg-orange-50 text-orange-700 border-orange-200";
  if (status === "作業完了" || status === "納品済み") return "bg-green-50 text-green-700 border-green-200";
  if (status === "部品待ち(未注文)" || status === "部品待ち(注文済み)" || status === "部品入荷済み" || status === "作業待ち" || status === "作業中") {
    return "bg-green-50 text-green-700 border-green-200";
  }
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default async function CustomerRepairPage({ params }: PageProps) {
  const token = params.token?.trim();
  if (!token) return notFound();

  const [documentTokenRow] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT "id"
    FROM "EstimateDocument"
    WHERE "publicToken" = ${token}
    LIMIT 1
  `;

  let repairs = [];
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
  const pageTotal = repairs.reduce((sum, repair) => {
    const estimateItems = repair.estimate?.items ?? [];
    return sum + estimateItems.reduce((itemSum, item) => itemSum + item.unitPrice * (item.quantity || 1), 0);
  }, 0);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-4 sm:py-8">
      <div className={`mx-auto space-y-4 ${isBusiness ? "max-w-5xl" : "max-w-2xl"}`}>
        <header className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-blue-600">
                {isBusiness ? "B2B Estimate Confirmation" : "Estimate Confirmation"}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">お見積確認ページ</h1>
              <p className="mt-1 text-sm text-slate-600">
                {isBusiness
                  ? "複数案件がある場合は、案件ごとに内容をご確認ください。コメント・承認・差戻しは各案件ごとに保存されます。"
                  : "内容をご確認いただき、ご不明点があれば承認前にコメントでご相談ください。"}
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              {repairs.length}件
            </span>
          </div>
        </header>

        <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold text-slate-500">
                {isBusiness ? "取引先" : "お客様"}
              </div>
              <div className="text-lg font-bold">{customerName || "お客様"}</div>
              {documentMeta && (
                <p className="mt-1 text-xs text-slate-500">
                  {documentMeta.estimateNumber} / {documentMeta.issuedDate.toLocaleDateString("ja-JP")}
                </p>
              )}
            </div>
            {!isBusiness && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-right">
                <div className="text-xs font-bold text-blue-700">税込合計</div>
                <div className="font-mono text-3xl font-bold text-blue-700">
                  ¥{pageTotal.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </section>

        {!isBusiness && (
          <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-950 shadow-sm">
            <h2 className="text-base font-bold">修理内容のご説明</h2>
            <p className="mt-2">
              今回のお見積りは、時計の状態確認にもとづいて作成しています。
              作業内容や金額についてご不明点がございましたら、承認前に下のコメント欄よりお気軽にご相談ください。
            </p>
          </section>
        )}

        {isBusiness ? (
          <CustomerRepairAccordionRoot>
            {repairs.map((repair, index) => {
              const estimateItems = repair.estimate?.items ?? [];
              const total = estimateItems.reduce((sum, item) => sum + item.unitPrice * (item.quantity || 1), 0);
              const watchName = [repair.watch.brand?.name, repair.watch.model?.name].filter(Boolean).join(" ");
              const endUserExplanation = repair.customerNote?.trim() || "";
              const repairActionToken = repair.publicToken || token;
              const latestMessages = repair.customerMessages.slice(0, 2);

              const summary = (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900">{repair.inquiryNumber}</span>
                        {repair.customerMessages.length > 0 && (
                          <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">
                            コメントあり
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-base font-bold text-slate-900">
                        {repair.endUserName || "エンドユーザー未登録"}
                      </div>
                      <div className="mt-1 truncate text-sm text-slate-500">{watchName || "-"}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-500">税込合計</div>
                      <div className="font-mono text-lg font-bold text-slate-950">¥{total.toLocaleString()}</div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getStatusBadgeClass(repair.status)}`}>
                      {repair.status}
                    </span>
                    <span className="text-sm font-bold text-blue-600">詳細を開く</span>
                  </div>
                </div>
              );

              return (
                <CustomerRepairAccordionItem key={repair.id} index={index} summary={summary}>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-500">案件番号</div>
                        <div className="font-mono text-lg font-bold text-slate-950">{repair.inquiryNumber}</div>
                        {repair.endUserName && (
                          <div className="mt-1 text-lg font-bold text-slate-700">エンドユーザー: {repair.endUserName}</div>
                        )}
                      </div>
                      <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${getStatusBadgeClass(repair.status)}`}>
                        {repair.status}
                      </span>
                    </div>
                    <div className="mt-4 text-sm font-bold text-slate-500">時計情報</div>
                    <div className="mt-1 text-base font-bold">{watchName || "-"}</div>
                    <div className="mt-1 text-base text-slate-600">
                      Ref: {repair.watch.reference?.name || "-"} / Serial: {repair.watch.serialNumber || "-"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-right">
                    <div className="text-sm font-bold text-blue-700">この案件の税込合計</div>
                    <div className="font-mono text-4xl font-bold text-blue-700">
                      ¥{total.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2">
                      <h2 className="text-lg font-bold">お見積内容</h2>
                    </div>

                    <div className="divide-y overflow-hidden rounded-lg border border-slate-200">
                      {estimateItems.length === 0 ? (
                        <div className="p-4 text-base text-slate-500">見積明細はまだありません。</div>
                      ) : (
                        estimateItems.map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-3 text-base">
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
                              {item.quantity > 1 && (
                                <div className="text-xs text-slate-500">数量: {item.quantity}</div>
                              )}
                            </div>
                            <div className="shrink-0 whitespace-nowrap font-mono font-bold">
                              ¥{(item.unitPrice * (item.quantity || 1)).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {repair.estimateDocument && (
                      <Link
                        href={`/documents/estimate/${repair.estimateDocument.id}`}
                        className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-slate-900 px-4 text-base font-bold text-white hover:bg-slate-700"
                      >
                        PDFを見る
                      </Link>
                    )}
                  </div>

                  <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold">エンドユーザー様への説明文</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          以下の文章は、お客様へのご説明にそのままご利用いただけます。
                        </p>
                      </div>
                      {endUserExplanation && <CopyExplanationButton text={endUserExplanation} />}
                    </div>
                    {endUserExplanation ? (
                      <div className="mt-3 whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white p-4 text-base leading-7 text-slate-800">
                        {endUserExplanation}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white p-4 text-base text-slate-500">
                        説明文はまだ登録されていません。
                      </div>
                    )}
                  </section>

                  <CustomerRepairActions
                    token={repairActionToken}
                    isBusiness={isBusiness}
                    inquiryNumber={repair.inquiryNumber}
                  />

                  {latestMessages.length > 0 && (
                    <section className="rounded-xl border bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-bold">コメント履歴</h2>
                          <p className="mt-1 text-sm text-slate-500">
                            このコメントは本案件に紐づいて保存されます。
                          </p>
                        </div>
                        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">
                          {repair.customerMessages.length}件
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {latestMessages.map((message) => (
                          <div key={message.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-base">
                            <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                              <span className="font-bold text-slate-700">{customerName || "お客様"} 様</span>
                              <span>{message.createdAt.toLocaleString("ja-JP")}</span>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap leading-7">{message.body}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <PartnerPrivateMemo token={repairActionToken} inquiryNumber={repair.inquiryNumber} />
                </CustomerRepairAccordionItem>
              );
            })}
          </CustomerRepairAccordionRoot>
        ) : (
          repairs.map((repair, index) => {
          const estimateItems = repair.estimate?.items ?? [];
          const total = estimateItems.reduce((sum, item) => sum + item.unitPrice * (item.quantity || 1), 0);
          const watchName = [repair.watch.brand?.name, repair.watch.model?.name].filter(Boolean).join(" ");
          const endUserExplanation = repair.customerNote?.trim() || "";
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
                        <div className="text-xs font-bold text-slate-500">案件番号</div>
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
                        Ref: {repair.watch.reference?.name || "-"} / Serial: {repair.watch.serialNumber || "-"}
                      </div>
                      {isBusiness && repair.endUserName && (
                        <div className="mt-2 text-xs text-slate-600">エンドユーザー: {repair.endUserName}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h2 className="text-base font-bold">お見積内容</h2>
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
                      estimateItems.map((item) => (
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
                            {item.quantity > 1 && (
                              <div className="text-xs text-slate-500">数量: {item.quantity}</div>
                            )}
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
                  <div className="text-xs font-bold text-blue-700">この案件の税込合計</div>
                  <div className="font-mono text-3xl font-bold text-blue-700">
                    ¥{total.toLocaleString()}
                  </div>
                </div>

                {isBusiness && (
                  <PartnerPrivateMemo token={repairActionToken} inquiryNumber={repair.inquiryNumber} />
                )}

                {isBusiness && (
                  <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold">エンドユーザー様への説明文</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          以下の文章は、お客様へのご説明にそのままご利用いただけます。
                        </p>
                      </div>
                      {endUserExplanation && <CopyExplanationButton text={endUserExplanation} />}
                    </div>
                    {endUserExplanation ? (
                      <div className="mt-3 whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white p-3 text-sm leading-relaxed text-slate-800">
                        {endUserExplanation}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-500">
                        説明文はまだ登録されていません。
                      </div>
                    )}
                  </section>
                )}

                <section className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold">コメント履歴</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        このコメントは本案件に紐づいて保存されます。
                      </p>
                    </div>
                    {repair.customerMessages.length > 0 && (
                      <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">
                        {repair.customerMessages.length}件
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {repair.customerMessages.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                        まだコメントはありません。
                      </div>
                    ) : (
                      repair.customerMessages.map((message) => (
                        <div key={message.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span className="font-bold text-slate-700">{customerName || "お客様"} 様</span>
                            <span>{message.createdAt.toLocaleString("ja-JP")}</span>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap leading-relaxed">{message.body}</div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <CustomerRepairActions
                  token={repairActionToken}
                  isBusiness={isBusiness}
                  inquiryNumber={repair.inquiryNumber}
                />
              </div>
            </section>
          );
          })
        )}

        {!isBusiness && (
          <section className="rounded-xl border border-blue-100 bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-sm">
            <h2 className="font-bold text-slate-900">ご相談について</h2>
            <p className="mt-2">
              追加作業や交換部品の状態によって、追加のご提案をさせていただく場合があります。
              迷われる場合はすぐに承認せず、コメント欄よりご相談ください。
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
