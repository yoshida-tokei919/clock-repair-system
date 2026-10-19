import Link from "next/link";
import { notFound } from "next/navigation";
import type { PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveCustomerRepairShareScope } from "@/lib/customer-repair-share";
import { getPublicIntakeShippingDecision, IntakeShippingDecisionError } from "@/lib/intake-shipping-decision";
import { getPublicIntakeDeliveryPreference, IntakeDeliveryPreferenceError } from "@/lib/intake-delivery-preference";
import { YUPURI_DELIVERY_TIME_OPTIONS } from "@/lib/yupuri-v3";
import { DeliveryPreferenceForm } from "../../delivery/[token]/DeliveryPreferenceForm";
import { ShippingDecisionForm } from "./ShippingDecisionForm";
import { formatPartDisplay } from "@/lib/formatPartDisplay";
import { CustomerRepairAccordionItem, CustomerRepairAccordionRoot } from "./CustomerRepairAccordion";
import {
  CopyExplanationButton,
  CustomerRepairActions,
  PartnerPrivateMemo,
  PdfLinkButton,
} from "./CustomerRepairActions";
import { CustomerExportTools, CustomerGuideAmountInput } from "./CustomerExportTools";
import { CustomerB2CApprovalPanel } from "./CustomerB2CApprovalPanel";
import { RepairPrepaymentCheckoutButton } from "@/components/customer/RepairPrepaymentCheckoutButton";
import { PREPAYMENT_STATUS_LABELS } from "@/lib/repair-prepayment-display";
import { publicShipmentViews } from "@/lib/customer-shipment-status";
import { visibleCustomerCommentTarget } from "@/lib/b2b-repair-comment-notice";
import { isIssuedOptionPdfCurrent, issuedOptionSourceHash } from "@/lib/estimate-options";
import { CustomerEstimateOptions } from "./CustomerEstimateOptions";
import { displayEstimateOptionContactNote } from "@/lib/estimate-option-contact-text";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ prepayment?: string | string[]; comment?: string | string[] }>;
};

const repairInclude = {
  customer: true,
  prepayments: {
    where: { kind: "REPAIR_PREPAYMENT" as const, status: { in: ["PENDING", "SUCCEEDED"] as PaymentStatus[] } },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    select: { id: true, amount: true, purpose: true, status: true, paidAt: true },
  },
  watch: { include: { brand: true, model: true, reference: true, caseReference: true, caliber: true } },
  photos: {
    where: { customerVisible: true },
    orderBy: { id: "asc" as const },
  },
  estimate: {
    include: {
      items: {
        include: {
          partsMaster: { select: { grade: true, notes2: true } },
        },
      },
    },
  },
  estimateOptionSet: { include: { choices: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }], include: { lines: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] } } } } },
  estimateOptionApproval: true,
  estimateDocument: { select: { id: true, customerId: true, pricingTaxMode: true, totalAmount: true, taxAmount: true, estimateNumber: true, issuedDate: true,
    customer: { select: { type: true, name: true, companyName: true, address: true } },
    currentPdfFile: { select: { id: true, estimateDocumentId: true, status: true, storageKey: true, hash: true, fileSize: true, optionSourceHashes: true } } } },
  customerMessages: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, body: true, createdAt: true, readAt: true, senderType: true },
  },
  shipmentRepairs: {
    select: { shipment: { select: {
      id: true, direction: true, status: true, carrierCode: true, trackingNumber: true,
      actualShippedAt: true, deliveredAt: true,
    } } },
  },
};

function getStatusBadgeClass(status: string) {
  if (status.includes("完了")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (isApprovedRepairStatus(status)) return "bg-green-50 text-green-700 border-green-200";
  if (status.includes("差戻") || status.includes("保留") || status.includes("キャンセル")) return "bg-red-50 text-red-700 border-red-200";
  return "bg-orange-50 text-orange-700 border-orange-200";
}

function getStatusBandClass(status: string) {
  if (status.includes("完了")) return "bg-blue-50/70 hover:bg-blue-50";
  if (isApprovedRepairStatus(status)) return "bg-green-50/70 hover:bg-green-50";
  if (status.includes("差戻") || status.includes("保留") || status.includes("キャンセル")) return "bg-red-50/70 hover:bg-red-50";
  if (status === "承認待ち") return "bg-orange-50/70 hover:bg-orange-50";
  return "bg-slate-50 hover:bg-slate-100";
}

function getStatusMessage(status: string) {
  if (status === "修理不可返却") return "修理不可のため、お預かり品の返却準備を進めています。";
  if (status === "キャンセル返却") return "キャンセルに伴い、お預かり品の返却準備を進めています。";
  if (status === "承認待ち") return "お見積内容をご確認ください。";
  if (status.includes("完了")) return "作業が完了しました。";
  if (isApprovedRepairStatus(status)) return "現在の進行状況をご確認いただけます。";
  return "現在の案件状況をご確認いただけます。";
}

function isApprovedRepairStatus(status: string) {
  return status === "承認済み" || status.startsWith("作業") || status.startsWith("部品");
}

function getEstimateItems(repair: any) {
  return repair.estimate?.items ?? [];
}

function getEstimateTotal(repair: any) {
  return getEstimateItems(repair).reduce((sum: number, item: any) => sum + item.unitPrice * (item.quantity || 1), 0);
}

function getEstimateAmounts(repair: any) {
  const lineSum = getEstimateTotal(repair);
  const inclusive = repair.estimate?.pricingTaxMode === "INCLUSIVE";
  const taxAmount = Number(BigInt(lineSum) * BigInt(10) / BigInt(inclusive ? 110 : 100));
  const subtotal = inclusive ? lineSum - taxAmount : lineSum;
  return { subtotal, taxAmount, total: inclusive ? lineSum : lineSum + taxAmount };
}

function getEndUserDisplayName(repair: any) {
  return repair.endUserName?.trim() || "";
}

function getWatchBrandModelLine(repair: any) {
  return [
    repair.watch?.brand?.name,
    repair.watch?.model?.name,
  ]
    .filter(Boolean)
    .join(" ");
}

const CUSTOMER_LINE_URL = "https://lin.ee/3C0XfJW";

function getRepairPhotoUrl(photo?: { id?: number; storageKey?: string | null } | null, token?: string) {
  const storageKey = photo?.storageKey?.trim();
  if (!storageKey) return null;
  if (/^(https?:|data:|blob:)/i.test(storageKey)) return storageKey;
  if (/^repairs\/\d+\/\d{6}\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(storageKey) && Number.isInteger(photo?.id) && token) return `/customer/repairs/${encodeURIComponent(token)}/photos/${photo!.id}`;
  return null;
}

function receptionPhotosForWatchCard(repair: { photos?: any[] }) {
  const photos = repair.photos ?? [];
  return photos.filter(
    (photo) => photo.stage === "RECEPTION" && ["FRONT", "BACK"].includes(photo.category),
  );
}

function photosForCustomerProgress(repair: { status?: string | null; photos?: any[] }) {
  const photos = repair.photos ?? [];
  const status = repair.status ?? "";
  const byStage = (stage: string, categories: string[]) => photos.filter(
    (photo) => photo.stage === stage && categories.includes(photo.category),
  );

  if (status.includes("作業中")) {
    const movementPhotos = byStage("WORK", ["MOVEMENT_OPEN"]);
    return movementPhotos.length ? movementPhotos : byStage("WORK", ["REPAIR_DETAIL"]);
  }
  if (status.includes("作業完了") || status.includes("納品")) {
    return byStage("COMPLETION", ["FRONT", "BACK"]);
  }
  // Reception photos belong to the watch card only. They must never be used
  // as a progress-photo fallback below the estimate total.
  return [];
}

function getCustomerStatus(status: string) {
  if (status === "修理不可返却") return { label: "修理不可・返却", className: "border-amber-200 bg-amber-50 text-amber-800" };
  if (status === "キャンセル返却") return { label: "キャンセル・返却", className: "border-amber-200 bg-amber-50 text-amber-800" };
  if (status === "承認待ち") return { label: "見積確認中", className: "border-blue-200 bg-blue-50 text-blue-800" };
  if (status === "見積中") return { label: "見積作成中", className: "border-slate-200 bg-slate-50 text-slate-700" };
  if (status === "保留") return { label: "確認中", className: "border-slate-200 bg-slate-50 text-slate-700" };
  if (["部品待ち(未注文)", "部品待ち(注文済み)", "部品入荷済み", "作業待ち"].includes(status)) return { label: "作業待ち", className: "border-sky-200 bg-sky-50 text-sky-800" };
  if (status === "作業中") return { label: "作業中", className: "border-indigo-200 bg-indigo-50 text-indigo-800" };
  if (status === "作業完了" || status === "納品済み") return { label: "完了", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  return { label: status || "確認中", className: "border-slate-200 bg-slate-50 text-slate-700" };
}

const isDedicatedReturnStatus = (status: string) => status === "修理不可返却" || status === "キャンセル返却";

function needsCustomerApproval(repair: any) {
  return repair.approvalStatus === "pending" && repair.status === "承認待ち";
}

function publicShipmentTime(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(value);
}

function CustomerShipmentStatusSection({ shipments }: { shipments: ReturnType<typeof publicShipmentViews> }) {
  if (!shipments.length) return null;
  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm" aria-label="配送状況">
      <h2 className="text-lg font-bold">配送状況</h2>
      <div className="mt-3 space-y-3">
        {shipments.map(shipment => {
          const shippedAt = publicShipmentTime(shipment.actualShippedAt);
          const deliveredAt = publicShipmentTime(shipment.deliveredAt);
          return <div key={shipment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-bold text-sky-800">{shipment.label}</span>
              {shipment.inquiryNumbers.length > 0 && <span className="text-xs text-slate-500">対象: {shipment.inquiryNumbers.join(" / ")}</span>}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{shipment.detail}</p>
            {shipment.trackingNumber && <p className="mt-2 text-sm"><span className="font-semibold">日本郵便 追跡番号:</span> <span className="font-mono">{shipment.trackingNumber}</span></p>}
            {(shippedAt || deliveredAt) && <div className="mt-2 space-y-1 text-xs text-slate-500">
              {shippedAt && <p>引受: {shippedAt}</p>}
              {deliveredAt && <p>配達完了: {deliveredAt}</p>}
            </div>}
          </div>;
        })}
      </div>
    </section>
  );
}

type ShippingDecisionView = { choice: "SHIP_COMPLETED" | "WAIT_ALL" | null; repairs: { inquiryNumber: string; completedAtRequest: boolean }[] };
type GroupDeliveryView = Awaited<ReturnType<typeof getPublicIntakeDeliveryPreference>>;
function CustomerRepairB2CPage({ token, repairs, documentMeta, prepaymentReturn, documentTokenAccess, shippingDecision, groupDelivery }: { token: string; repairs: any[]; documentMeta: { estimateNumber: string; issuedDate: Date } | null; prepaymentReturn?: string; documentTokenAccess: boolean; shippingDecision?: ShippingDecisionView; groupDelivery?: GroupDeliveryView }) {
  const shipments = publicShipmentViews(repairs);
  return (
    <main className="min-h-screen bg-[#f3f6fa] px-3 py-4 text-slate-900 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold tracking-wide text-slate-500">時計修理のご案内</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">修理状況・お見積</h1>
          {documentMeta && <p className="mt-2 text-sm text-slate-500">{documentMeta.estimateNumber} / {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo" }).format(documentMeta.issuedDate)}</p>}
        </header>

        {prepaymentReturn === "success" && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">前受金のお支払い結果を確認中です。反映まで少し時間がかかる場合があります。</p>}
        {prepaymentReturn === "cancel" && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">前受金のお支払い画面から戻りました。お支払いを希望される場合は、下の前受金欄から再度お進みください。</p>}

        <CustomerShipmentStatusSection shipments={shipments} />

        {shippingDecision && <ShippingDecisionForm token={token} initialChoice={shippingDecision.choice} repairs={shippingDecision.repairs} />}
        {groupDelivery?.groups.map(group => <section key={group.groupKind} className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm" aria-label="配達日時のご希望">
          <h2 className="text-lg font-bold">今回発送する時計の配達日時のご希望</h2>
          {groupDelivery.groups.length > 1 && <p className="mt-2 text-sm font-semibold">{group.groupKind === "COMPLETED_AT_REQUEST" ? "先に発送する時計" : "残りの時計"}</p>}
          <p className="mt-2 text-sm">対象のお問合番号</p>
          <ul className="mt-2 list-inside list-disc text-sm">{group.repairs.map(repair => <li key={repair.inquiryNumber}>{repair.inquiryNumber}</li>)}</ul>
          {group.available || group.preference ? <div className="mt-4"><DeliveryPreferenceForm token={token} endpoint={`/api/customer/intake-delivery/${encodeURIComponent(token)}`} groupKind={group.groupKind} initial={{ editable: group.editable, applicationStatus: group.applicationStatus, preference: group.preference }} timeOptions={YUPURI_DELIVERY_TIME_OPTIONS.filter(option => option.value !== "指定なし").map(option => ({ value: option.value, label: option.label }))} /></div>
            : <p className="mt-4 text-sm">対象の時計がすべて作業完了すると配達希望をご回答いただけます。</p>}
        </section>)}

        <CustomerRepairAccordionRoot initialOpenIndex={repairs[0]?.status === "作業中" ? -1 : 0}>
          {repairs.map((repair, index) => {
            const estimateItems = getEstimateItems(repair);
            const { subtotal, taxAmount, total } = getEstimateAmounts(repair);
            const receptionPhotos = receptionPhotosForWatchCard(repair);
            const customerPhotos = photosForCustomerProgress(repair);
            const repairToken = typeof repair.publicToken === "string" && repair.publicToken.trim() ? repair.publicToken : null;
            const readToken = repairToken ?? (documentTokenAccess ? token : null);
            const prepaymentToken = repairToken ?? (documentTokenAccess ? token : null);
            const primaryPhotoUrl = getRepairPhotoUrl(receptionPhotos[0], readToken ?? undefined);
            const status = getCustomerStatus(repair.status);
            const watchName = getWatchBrandModelLine(repair);
            const identifiers = [
              repair.watch?.reference?.name && `Ref. ${repair.watch.reference.name}`,
              repair.watch?.caliber?.name && `Cal. ${repair.watch.caliber.name}`,
            ].filter(Boolean);
            const explanationText = displayEstimateOptionContactNote(repair.customerNote);

            return (
              <CustomerRepairAccordionItem
                key={repair.id}
                index={index}
                statusBand={<div className="border-b border-slate-100 bg-white px-4 pt-4"><span className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${status.className}`}>{status.label}</span>{isDedicatedReturnStatus(repair.status) && <p className="mt-2 text-sm text-slate-600">お預かり品の返却準備を進めています。</p>}</div>}
                summary={
                  <div className="flex min-w-0 gap-3">
                    {primaryPhotoUrl && <img src={primaryPhotoUrl} alt={`${watchName || "時計"}の写真`} className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 bg-slate-50 object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold leading-6 text-slate-950">{watchName || "時計情報を確認中"}</p>
                      {identifiers.length > 0 && <p className="mt-1 break-words text-sm leading-5 text-slate-500">{identifiers.join(" / ")}</p>}
                      <div className="mt-3"><p className="text-xs font-bold text-slate-500">税込合計</p><p className="font-mono text-2xl font-bold text-blue-700">¥{total.toLocaleString()}</p></div>
                    </div>
                  </div>
                }
              >
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{isDedicatedReturnStatus(repair.status) ? "返却・最終精算内容" : "見積内容"}</h2>{repair.estimateDocument && readToken && <PdfLinkButton href={`/customer/repairs/${readToken}/estimate.pdf`} />}</div>
                  <div className="mt-3 divide-y divide-slate-100">{estimateItems.length === 0 ? <p className="py-3 text-sm text-slate-500">見積明細はまだありません。</p> : estimateItems.map((item: any) => <div key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0 font-medium">{item.type === "part" ? formatPartDisplay({ name: item.itemName, grade: item.partsMaster?.grade, note2: item.partsMaster?.notes2 }) : item.itemName}{item.quantity > 1 && <span className="ml-2 text-slate-500">数量 {item.quantity}</span>}</div><span className="shrink-0 font-mono font-bold">¥{(item.unitPrice * (item.quantity || 1)).toLocaleString()}</span></div>)}</div>
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-sm"><div className="flex justify-between text-slate-600"><span>{repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "課税対象額（税込）" : "税抜小計"}</span><span className="font-mono">¥{(repair.estimate?.pricingTaxMode === "INCLUSIVE" ? total : subtotal).toLocaleString()}</span></div><div className="flex justify-between text-slate-600"><span>{repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "内消費税（10%）" : "消費税（10%）"}</span><span className="font-mono">¥{taxAmount.toLocaleString()}</span></div><div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2"><span className="font-bold">税込合計</span><span className="font-mono text-xl font-bold text-blue-700">¥{total.toLocaleString()}</span></div></div>
                </section>

                {repair.prepayments.length > 0 && (
                  <section className="rounded-xl border border-blue-200 bg-white p-4">
                    <h2 className="text-lg font-bold">前受金 / 部品代先払い</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">こちらは部品代などの先払い（前受金）です。お支払い済みの金額は、最終精算時に受領済みとして反映します。</p>
                    <ul className="mt-3 divide-y divide-slate-100">
                      {repair.prepayments.map((payment: { id: number; amount: number; purpose: string | null; status: "PENDING" | "SUCCEEDED"; paidAt: Date | null }) => (
                        <li key={payment.id} className="py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                            <span className="font-medium break-words">{payment.purpose || "前受金"}</span>
                            <span className="font-mono font-bold">¥{payment.amount.toLocaleString()}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{PREPAYMENT_STATUS_LABELS[payment.status]}{payment.status === "SUCCEEDED" && payment.paidAt && ` · 入金日: ${payment.paidAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}`}</p>
                          {payment.status === "PENDING" && prepaymentToken && !isDedicatedReturnStatus(repair.status) && <RepairPrepaymentCheckoutButton token={prepaymentToken} paymentId={payment.id} />}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {explanationText && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h2 className="text-lg font-bold">ご案内</h2><div className="mt-3 min-h-32 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-7 text-slate-800">{explanationText}</div></section>}

                {customerPhotos.length > 0 && readToken && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-lg font-bold">写真</h2><div className="mt-3 grid grid-cols-2 gap-2">{customerPhotos.map((photo: any) => { const photoUrl = getRepairPhotoUrl(photo, readToken); return photoUrl ? <a key={photo.id} href={photoUrl} target="_blank" rel="noopener noreferrer"><img src={photoUrl} alt={photo.fileName || "時計の写真"} className="aspect-square w-full rounded-lg border border-slate-200 object-cover" /></a> : null; })}</div></section>}

                {repairToken && <CustomerB2CApprovalPanel token={repairToken} isApproved={repair.approvalStatus === "approved"} showApproval={needsCustomerApproval(repair)} lineUrl={CUSTOMER_LINE_URL} inquiryNumber={repair.inquiryNumber} photoPostingOptOut={repair.photoPostingOptOut} address={{ recipientName: repair.returnRecipientName || "", postalCode: repair.returnPostalCode || "", prefecture: repair.returnPrefecture || "", city: repair.returnCity || "", street: repair.returnStreet || "", building: repair.returnBuilding || "", phone: repair.returnPhone || "" }} />}
              </CustomerRepairAccordionItem>
            );
          })}
        </CustomerRepairAccordionRoot>
      </div>
    </main>
  );
}

export default async function CustomerRepairPage({ params, searchParams }: PageProps) {
  const token = (await params).token?.trim();
  if (!token) return notFound();

  const [documentTokenRow] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT "id"
    FROM "EstimateDocument"
    WHERE "publicToken" = ${token}
    LIMIT 1
  `;

  let repairs: any[] = [];
  let documentMeta: { id: number; estimateNumber: string; issuedDate: Date } | null = null;
  let shippingDecision: ShippingDecisionView | undefined;
  let groupDelivery: GroupDeliveryView | undefined;

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
    const scope = await resolveCustomerRepairShareScope(prisma, token);
    if (!scope) return notFound();

    repairs = await prisma.repair.findMany({
      where: scope.grouped
        ? {
            id: { in: scope.repairIds },
            customerId: scope.customerId,
            repairIntakeInviteId: scope.repairIntakeInviteId,
          }
        : { id: { in: scope.repairIds } },
      orderBy: { id: "asc" },
      include: repairInclude,
    });

    if (repairs.length !== scope.repairIds.length) return notFound();
    documentMeta = repairs.length === 1 ? repairs[0].estimateDocument : null;
    if (scope.grouped) {
      try { shippingDecision = await getPublicIntakeShippingDecision(prisma, token); }
      catch (error) { if (!(error instanceof IntakeShippingDecisionError)) { console.error("Public intake shipping page failed"); return notFound(); } }
      try { groupDelivery = await getPublicIntakeDeliveryPreference(prisma, token); }
      catch (error) {
        if (error instanceof IntakeDeliveryPreferenceError) { if (error.status !== 409) return notFound(); }
        else { console.error("Public grouped delivery page failed"); return notFound(); }
      }
    }
  }

  const primaryRepair = repairs[0];
  const isBusiness = primaryRepair.customer.type === "business";
  const commentTarget = isBusiness ? visibleCustomerCommentTarget((await searchParams).comment, repairs) : null;
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
      customerName: getEndUserDisplayName(repair),
      brand: repair.watch?.brand?.name || "",
      model: repair.watch?.model?.name || "",
      reference: repair.watch?.reference?.name || "",
      serialNumber: repair.watch?.serialNumber || "",
      shopEstimate: getEstimateTotal(repair),
      customerEstimate: "",
      explanation: displayEstimateOptionContactNote(repair.customerNote),
      privateMemo: "",
    };
  });

  if (isBusiness) {
    const commentCount = repairs.filter((repair) => repair.customerMessages.length > 0).length;
    const approvedCount = repairs.filter((repair) => repair.approvalStatus === "approved" || isApprovedRepairStatus(repair.status)).length;
    const pendingCount = repairs.filter((repair) => repair.approvalStatus !== "approved" && !isApprovedRepairStatus(repair.status) && !isDedicatedReturnStatus(repair.status)).length;
    const publicPdfHref = `/customer/repairs/${token}/estimate.pdf`;

    return (
      <main className="min-h-screen bg-[#f5f8fc] px-3 py-4 text-slate-900 sm:px-4 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <header className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-r from-white via-white to-blue-50/70 p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">お見積確認ページ</h1>
              </div>
              <p className="mt-3 text-base text-slate-700">共有先: {customerName} 様</p>
              {documentMeta && (
                <p className="mt-1 text-sm text-slate-500">
                  {documentMeta?.estimateNumber} / {documentMeta?.issuedDate.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1 sm:gap-2">
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-center font-bold shadow-sm sm:p-3 sm:text-base">
                <span className="block text-[10px] leading-4 sm:inline sm:text-base">全</span>
                <span className="block font-mono text-lg leading-5 sm:ml-1 sm:inline sm:text-base">{repairs.length}件</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-center font-bold shadow-sm sm:p-3 sm:text-base">
                <span className="block text-[10px] leading-4 sm:inline sm:text-base">未確認</span>
                <span className="block font-mono text-lg leading-5 sm:ml-1 sm:inline sm:text-base">{pendingCount}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-center font-bold shadow-sm sm:p-3 sm:text-base">
                <span className="block text-[10px] leading-4 sm:inline sm:text-base">コメントあり</span>
                <span className="block font-mono text-lg leading-5 sm:ml-1 sm:inline sm:text-base">{commentCount}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-center font-bold shadow-sm sm:p-3 sm:text-base">
                <span className="block text-[10px] leading-4 sm:inline sm:text-base">承認済み</span>
                <span className="block font-mono text-lg leading-5 sm:ml-1 sm:inline sm:text-base">{approvedCount}</span>
              </div>
            </div>
          </header>

          <CustomerShipmentStatusSection shipments={publicShipmentViews(repairs)} />

          <CustomerRepairAccordionRoot initialOpenIndex={commentTarget?.index ?? 0}>
            {repairs.map((repair, index) => {
              const estimateItems = getEstimateItems(repair);
              const { subtotal, taxAmount, total } = getEstimateAmounts(repair);
              const explanationText = displayEstimateOptionContactNote(repair.customerNote);
              const repairActionToken = repair.publicToken || token;
              const amountToken = repair.publicToken || `${token}:${repair.id}`;
              const privateMemoToken = repair.publicToken || `${token}:${repair.id}`;
              const amountKey = `customer-guide-amount:${amountToken}:${repair.id}`;
              const endUserDisplayName = getEndUserDisplayName(repair);
              const partnerRef = repair.partnerRef?.trim() || "";
              const brandModelLine = getWatchBrandModelLine(repair);
              const referenceName = repair.watch?.reference?.name || "";
              const serialNumber = repair.watch?.serialNumber || "";
              const latestMessages = (commentTarget?.index === index ? repair.customerMessages : repair.customerMessages.slice(0, 2)).map((message: any) => ({
                ...message,
                createdAt: message.createdAt.toISOString(),
                readAt: message.readAt ? message.readAt.toISOString() : null,
                senderType: message.senderType || "partner",
              }));
              const activeOptions = repair.customer.type === "business" && repair.estimateOptionSet?.isActive ? repair.estimateOptionSet : null;
              const optionHash = activeOptions && repair.estimateDocument && repair.estimate
                ? issuedOptionSourceHash(repair.estimateDocument, repair) : "";
              const optionPdf = repair.estimateDocument?.currentPdfFile;
              const optionAvailable = Boolean(activeOptions && !repair.partsAllocationLegacy && repair.customerId === repair.estimateDocument?.customerId &&
                repair.approvalStatus === "pending" && repair.status === "承認待ち" &&
                repair.estimateDocument && isIssuedOptionPdfCurrent(optionPdf, repair.estimateDocument.id, repair.id, optionPdf?.id ?? -1, optionHash));
              const approvedSnapshot = repair.estimateOptionApproval?.lineSnapshot as { commonLines?: { quantity: number; unitPrice: number }[] } | null;

              const repairHeader = (
                <div className="min-w-0 space-y-2">
                  {(endUserDisplayName || partnerRef || repair.inquiryNumber) && (
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                      {endUserDisplayName && <span className="text-base font-semibold leading-6 text-slate-900">{endUserDisplayName} 様</span>}
                      {partnerRef && <span className="text-sm font-medium leading-5 text-slate-700">管 {partnerRef}</span>}
                      {repair.inquiryNumber && <span className="text-sm font-medium leading-5 text-slate-700">問 {repair.inquiryNumber}</span>}
                    </div>
                  )}
                  <div className="min-w-0 truncate text-lg font-bold leading-6 text-slate-900">{brandModelLine || "-"}</div>
                  <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm font-medium leading-5 text-slate-600">
                    {referenceName && <span className="break-all">Ref: {referenceName}</span>}
                    {serialNumber && <span className="break-all">Ser: {serialNumber}</span>}
                    {!referenceName && !serialNumber && (
                      <span>-</span>
                    )}
                  </div>
                </div>
              );

              return (
                <CustomerRepairAccordionItem
                  key={repair.id}
                  index={index}
                  summary={repairHeader}
                  statusBand={
                    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/5 px-4 py-3 ${getStatusBandClass(repair.status)}`}>
                      <span className={`inline-flex rounded-full border px-4 py-2 text-lg font-bold shadow-sm ${getStatusBadgeClass(repair.status)}`}>
                        {repair.status}
                      </span>
                      <p className="text-sm font-medium text-slate-700">{getStatusMessage(repair.status)}</p>
                    </div>
                  }
                >
                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="-mx-4 -mt-4 mb-4 flex items-center justify-between gap-3 bg-[#f2f7ff] px-4 py-3">
                      <h2 className="text-lg font-bold text-slate-900">{isDedicatedReturnStatus(repair.status) ? "返却・最終精算内容" : activeOptions && repair.approvalStatus === "pending" ? "共通見積内容（選択前）" : "見積内容"}</h2>
                      {repair.estimateDocument && <PdfLinkButton href={publicPdfHref} />}
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

                    <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
                      <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                        <div>{repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "課税対象額（税込）" : "税抜小計"}</div>
                        <div className="font-mono font-medium">¥{(repair.estimate?.pricingTaxMode === "INCLUSIVE" ? total : subtotal).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                        <div>{repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "内消費税（10%）" : "消費税（10%）"}</div>
                        <div className="font-mono font-medium">¥{taxAmount.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2 pt-1">
                        <div className="font-bold text-slate-900">{activeOptions && repair.approvalStatus === "pending" ? "共通見積の税込額（選択前）" : "税込合計"}</div>
                        <div className="font-mono text-2xl font-bold text-blue-700">¥{total.toLocaleString()}</div>
                      </div>
                    </div>
                  </section>

                  {activeOptions && <CustomerEstimateOptions
                    token={repair.publicToken || token} repairId={repair.id} inquiryNumber={repair.inquiryNumber}
                    title={activeOptions.title} notes={activeOptions.notes}
                    commonLines={(approvedSnapshot?.commonLines ?? repair.estimate?.items ?? []).map((line: { quantity: number; unitPrice: number }) => ({ quantity: line.quantity, unitPrice: line.unitPrice }))}
                    choices={activeOptions.choices.map((choice: any) => ({ id: choice.id, kind: choice.kind, name: choice.name,
                      notes: choice.notes, recommended: choice.recommended, lines: choice.lines.map((line: any) => ({
                        id: line.id, itemNameSnapshot: line.itemNameSnapshot, displayNameSnapshot: line.displayNameSnapshot,
                        quantity: line.quantity, unitPrice: line.unitPrice,
                      })) }))} mode={repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE"}
                    pdfFileId={optionPdf?.id ?? null} optionSourceHash={optionHash}
                    available={optionAvailable} approved={Boolean(repair.estimateOptionApproval)}
                    unavailableMessage={repair.partsAllocationLegacy ? "旧形式の案件はこの画面から選択承認できません。工房へご連絡ください。" : undefined}
                    approvedPlanId={repair.estimateOptionApproval?.planChoiceId}
                    approvedAddOnIds={Array.isArray(repair.estimateOptionApproval?.addOnChoiceIds) ? repair.estimateOptionApproval.addOnChoiceIds as number[] : []}
                  />}

                  {explanationText && (
                    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg font-bold text-slate-900">お客様への説明</h2>
                        <CopyExplanationButton text={explanationText} />
                      </div>
                      <div className="mt-3 min-h-28 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-base leading-7 text-slate-800">
                        {explanationText}
                      </div>
                    </section>
                  )}

                  <CustomerRepairActions
                    token={repairActionToken}
                    isBusiness={isBusiness}
                    showApproval={!activeOptions}
                    isApproved={repair.approvalStatus === "approved"}
                    inquiryNumber={repair.inquiryNumber}
                    repairStatus={repair.status}
                    messages={latestMessages}
                    focusCommentId={commentTarget?.index === index ? commentTarget.id : undefined}
                    photoPostingOptOut={repair.photoPostingOptOut}
                    customerName={customerName || "取引先"}
                  />

                  <CustomerGuideAmountInput amountKey={amountKey} baseAmount={subtotal} />

                  <PartnerPrivateMemo token={privateMemoToken} inquiryNumber={repair.inquiryNumber} />
                </CustomerRepairAccordionItem>
              );
            })}
          </CustomerRepairAccordionRoot>

          <CustomerExportTools repairs={exportRepairs} />
        </div>
      </main>
    );
  }

  const prepaymentReturn = (await searchParams).prepayment;
  return <CustomerRepairB2CPage token={token} repairs={repairs} documentMeta={documentMeta} prepaymentReturn={typeof prepaymentReturn === "string" ? prepaymentReturn : undefined} documentTokenAccess={Boolean(documentTokenRow)} shippingDecision={shippingDecision} groupDelivery={groupDelivery} />;

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
                  {documentMeta?.estimateNumber} / {documentMeta?.issuedDate.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
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
          const explanationText = displayEstimateOptionContactNote(repair.customerNote);
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
                  photoPostingOptOut={repair.photoPostingOptOut}
                />
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
