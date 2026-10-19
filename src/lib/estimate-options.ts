import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { assertYen, sumCustomerLines, type PricingTaxMode } from "@/lib/pricing-tax";
import { selectedOptionTotal } from "@/lib/estimate-option-totals";
export { selectedOptionTotal } from "@/lib/estimate-option-totals";

export type OptionLineInput = {
  lineType: "LABOR" | "PART";
  itemNameSnapshot: string;
  displayNameSnapshot?: string | null;
  notesForCustomerSnapshot?: string | null;
  workTypeSnapshot?: "INTERNAL" | "EXTERNAL" | null;
  categoryNameSnapshot?: string | null;
  actionNameSnapshot?: string | null;
  targetPartNameSnapshot?: string | null;
  detailLabelSnapshot?: string | null;
  partsMasterId?: number | null;
  pricingRuleId?: number | null;
  repairWorkCategoryId?: number | null;
  repairWorkActionId?: number | null;
  targetPartNameId?: string | null;
  quantity: number;
  unitPrice: number;
};
export type OptionChoiceInput = { kind: "PLAN" | "ADD_ON"; name: string; notes?: string | null; recommended: boolean; lines: OptionLineInput[] };
export type OptionSetInput = { title: string; notes?: string | null; isActive: boolean; choices: OptionChoiceInput[] };

const shortText = (value: unknown, label: string, required = false): string | null => {
  if (value == null || value === "") {
    if (required) throw new Error(`${label}を入力してください。`);
    return null;
  }
  if (typeof value !== "string" || value.trim().length > 500) throw new Error(`${label}が不正です。`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${label}を入力してください。`);
  return trimmed || null;
};
const optionalId = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error("参照IDが不正です。");
  return value as number;
};

export function parseOptionSet(value: unknown): OptionSetInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("選択肢データが不正です。");
  const raw = value as Record<string, unknown>;
  if (typeof raw.isActive !== "boolean" || !Array.isArray(raw.choices) || raw.choices.length > 30) throw new Error("選択肢データが不正です。");
  const choices = raw.choices.map((entry): OptionChoiceInput => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("選択肢が不正です。");
    const choice = entry as Record<string, unknown>;
    if (choice.kind !== "PLAN" && choice.kind !== "ADD_ON") throw new Error("選択肢の種別が不正です。");
    if (typeof choice.recommended !== "boolean" || !Array.isArray(choice.lines) || choice.lines.length < 1 || choice.lines.length > 50) throw new Error("選択肢の明細が不正です。");
    return {
      kind: choice.kind, name: shortText(choice.name, "選択肢名", true)!, notes: shortText(choice.notes, "条件"), recommended: choice.recommended,
      lines: choice.lines.map((entry): OptionLineInput => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("選択肢明細が不正です。");
        const line = entry as Record<string, unknown>;
        if (line.lineType !== "LABOR" && line.lineType !== "PART") throw new Error("明細種別が不正です。");
        if (line.workTypeSnapshot != null && line.workTypeSnapshot !== "INTERNAL" && line.workTypeSnapshot !== "EXTERNAL") throw new Error("作業区分が不正です。");
        if (!Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 || (line.quantity as number) > 10000) throw new Error("数量が不正です。");
        assertYen(line.unitPrice as number);
        const parsed: OptionLineInput = {
          lineType: line.lineType, itemNameSnapshot: shortText(line.itemNameSnapshot, "明細名", true)!,
          displayNameSnapshot: shortText(line.displayNameSnapshot, "表示名"), notesForCustomerSnapshot: shortText(line.notesForCustomerSnapshot, "備考"),
          workTypeSnapshot: line.workTypeSnapshot as OptionLineInput["workTypeSnapshot"],
          categoryNameSnapshot: shortText(line.categoryNameSnapshot, "カテゴリ名"), actionNameSnapshot: shortText(line.actionNameSnapshot, "処置名"),
          targetPartNameSnapshot: shortText(line.targetPartNameSnapshot, "対象部品名"), detailLabelSnapshot: shortText(line.detailLabelSnapshot, "詳細"),
          partsMasterId: optionalId(line.partsMasterId), pricingRuleId: optionalId(line.pricingRuleId),
          repairWorkCategoryId: optionalId(line.repairWorkCategoryId), repairWorkActionId: optionalId(line.repairWorkActionId),
          targetPartNameId: shortText(line.targetPartNameId, "対象部品ID"),
          quantity: line.quantity as number, unitPrice: line.unitPrice as number,
        };
        if (parsed.lineType === "LABOR" && parsed.partsMasterId != null) throw new Error("作業明細に在庫部品を指定できません。");
        if (parsed.lineType === "PART" && (parsed.repairWorkCategoryId || parsed.repairWorkActionId || parsed.pricingRuleId)) throw new Error("部品明細に作業マスタを指定できません。");
        return parsed;
      }),
    };
  });
  const plans = choices.filter((choice) => choice.kind === "PLAN");
  if (raw.isActive && (choices.length === 0 || plans.length === 1)) throw new Error("有効な選択肢には2案以上のプラン、または1件以上の追加作業が必要です。");
  if (plans.filter((choice) => choice.recommended).length > 1) throw new Error("推奨プランは1つだけ指定できます。");
  return { title: shortText(raw.title, "見積案タイトル") ?? "", notes: shortText(raw.notes, "全体条件"), isActive: raw.isActive, choices };
}

export function optionTotals(commonLines: readonly { unitPrice: number; quantity: number }[], choices: readonly { kind: string; lines: readonly { unitPrice: number; quantity: number }[] }[], mode: PricingTaxMode) {
  return choices.map((choice) => choice.kind === "PLAN"
    ? selectedOptionTotal(commonLines, choice, [], mode)
    : selectedOptionTotal([], null, [choice], mode));
}

export function commonEstimateAmountMatches(items: readonly { unitPrice: number; quantity: number }[], estimate: { totalAmount: number; taxAmount: number }, mode: PricingTaxMode): boolean {
  return sumCustomerLines(items) === estimate.totalAmount + (mode === "INCLUSIVE" ? estimate.taxAmount : 0);
}

type IssuedOptionRepair = {
  id: number;
  customerId: number;
  inquiryNumber?: string;
  partnerRef?: string | null;
  endUserName?: string | null;
  customerNote?: string | null;
  watch?: { timepieceType: string | null; timepieceTypeLabel: string | null; serialNumber: string | null;
    brand: { name: string } | null; model: { name: string } | null; reference: { name: string } | null; caseReference: { name: string } | null };
  estimate: { pricingTaxMode: string; totalAmount: number; taxAmount: number; discountAmount: number; shipping: number; items: { id: number; itemName: string; type: string; unitPrice: number; quantity: number; partsMasterId: number | null; partsMaster?: { grade: string | null; notes2: string | null } | null; sourceAreaSnapshot: string | null; categoryNameSnapshot: string | null; targetPartNameSnapshot: string | null; actionNameSnapshot: string | null; detailLabelSnapshot: string | null; b2cDisplayNameSnapshot: string | null; gradeNameSnapshot: string | null }[] } | null;
  estimateOptionSet: { id: number; title: string; notes: string | null; isActive: boolean; choices: { id: number; kind: string; name: string; notes: string | null; recommended: boolean; sortOrder: number; lines: { id: number; sortOrder: number; lineType: string; itemNameSnapshot: string; displayNameSnapshot: string | null; notesForCustomerSnapshot: string | null; workTypeSnapshot: string | null; categoryNameSnapshot: string | null; actionNameSnapshot: string | null; targetPartNameSnapshot: string | null; detailLabelSnapshot: string | null; partsMasterId: number | null; pricingRuleId: number | null; repairWorkCategoryId: number | null; repairWorkActionId: number | null; targetPartNameId: string | null; quantity: number; unitPrice: number }[] }[] } | null;
};

// Stable projection of everything that can affect the issued common and option lines.
// A pre-C PDF has no hash and must be regenerated before public option approval.
export function issuedOptionSourceHash(document: { id: number; customerId: number; pricingTaxMode: string; totalAmount: number; taxAmount: number;
  estimateNumber?: string; issuedDate?: Date; customer?: { type: string; name: string; companyName: string | null; address: string | null } }, repair: IssuedOptionRepair): string {
  const estimate = repair.estimate;
  const set = repair.estimateOptionSet;
  const source = {
    documentId: document.id, documentCustomerId: document.customerId, documentTaxMode: document.pricingTaxMode,
    documentTotal: document.totalAmount, documentTax: document.taxAmount,
    estimateNumber: document.estimateNumber, issuedDate: document.issuedDate?.toISOString(),
    customer: document.customer && { type: document.customer.type, name: document.customer.name,
      companyName: document.customer.companyName, address: document.customer.address },
    repairId: repair.id, repairCustomerId: repair.customerId, estimateTaxMode: estimate?.pricingTaxMode,
    inquiryNumber: repair.inquiryNumber, partnerRef: repair.partnerRef, endUserName: repair.endUserName,
    customerNote: repair.customerNote,
    watch: repair.watch && { timepieceType: repair.watch.timepieceType, timepieceTypeLabel: repair.watch.timepieceTypeLabel,
      serialNumber: repair.watch.serialNumber, brand: repair.watch.brand?.name, model: repair.watch.model?.name,
      reference: repair.watch.reference?.name, caseReference: repair.watch.caseReference?.name },
    estimateTotal: estimate?.totalAmount, estimateTax: estimate?.taxAmount,
    estimateDiscount: estimate?.discountAmount, estimateShipping: estimate?.shipping,
    commonLines: estimate?.items.map(item => ({
      id: item.id, itemName: item.itemName, type: item.type, unitPrice: item.unitPrice, quantity: item.quantity,
      partsMasterId: item.partsMasterId, partsMaster: item.partsMaster && { grade: item.partsMaster.grade, notes2: item.partsMaster.notes2 },
      sourceAreaSnapshot: item.sourceAreaSnapshot, categoryNameSnapshot: item.categoryNameSnapshot,
      targetPartNameSnapshot: item.targetPartNameSnapshot, actionNameSnapshot: item.actionNameSnapshot,
      detailLabelSnapshot: item.detailLabelSnapshot, b2cDisplayNameSnapshot: item.b2cDisplayNameSnapshot, gradeNameSnapshot: item.gradeNameSnapshot,
    })).sort((a, b) => a.id - b.id),
    set: set && { id: set.id, title: set.title, notes: set.notes, isActive: set.isActive,
      choices: set.choices.map(choice => ({
        id: choice.id, kind: choice.kind, name: choice.name, notes: choice.notes, recommended: choice.recommended, sortOrder: choice.sortOrder,
        lines: choice.lines.map(line => ({ ...line })).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
      })).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    },
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export function validateOptionSelection<T extends { id: number; kind: string; lines: { unitPrice: number; quantity: number }[] }>(set: { choices: T[] }, planChoiceId: unknown, addOnChoiceIds: unknown) {
  if (!Array.isArray(addOnChoiceIds) || addOnChoiceIds.length > 30 || addOnChoiceIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error("追加作業の選択が不正です。");
  const ids = addOnChoiceIds as number[];
  if (new Set(ids).size !== ids.length) throw new Error("追加作業が重複しています。");
  const plans = set.choices.filter(choice => choice.kind === "PLAN");
  if (plans.length && (!Number.isSafeInteger(planChoiceId) || !plans.some(choice => choice.id === planChoiceId))) throw new Error("プランを1つ選択してください。");
  if (!plans.length && planChoiceId !== null) throw new Error("プランの選択が不正です。");
  const addOns = set.choices.filter(choice => choice.kind === "ADD_ON" && ids.includes(choice.id));
  if (addOns.length !== ids.length) throw new Error("追加作業の選択が不正です。");
  return { plan: plans.find(choice => choice.id === planChoiceId) ?? null, addOns };
}

export function isIssuedOptionPdfCurrent(pdf: { id: number; estimateDocumentId: number; status: string; storageKey: string; hash: string | null; fileSize: number | null; optionSourceHashes: unknown } | null,
  documentId: number, repairId: number, expectedPdfId: number, sourceHash: string): boolean {
  return Boolean(pdf && pdf.id === expectedPdfId && pdf.estimateDocumentId === documentId && pdf.status === "current" &&
    pdf.storageKey && pdf.hash && pdf.fileSize && typeof pdf.optionSourceHashes === "object" && pdf.optionSourceHashes !== null &&
    !Array.isArray(pdf.optionSourceHashes) && (pdf.optionSourceHashes as Record<string, unknown>)[String(repairId)] === sourceHash);
}

export function documentTokenIncludesRepair(document: { customerId: number; repairs: readonly { id: number }[] } | null,
  repair: { id: number; customerId: number; customerType: string }): boolean {
  return Boolean(document && repair.customerType === "business" && document.customerId === repair.customerId &&
    document.repairs.some(member => member.id === repair.id));
}

export function isSameOptionApproval(previous: { pdfFileId: number; planChoiceId: number | null; addOnChoiceIds: unknown; approverName: string; optionSourceHash: string } | null,
  attempt: { pdfFileId: number; planChoiceId: unknown; addOnChoiceIds: unknown; approverName: string; optionSourceHash: string }): boolean {
  return Boolean(previous && previous.pdfFileId === attempt.pdfFileId && previous.planChoiceId === attempt.planChoiceId &&
    Array.isArray(previous.addOnChoiceIds) && Array.isArray(attempt.addOnChoiceIds) &&
    JSON.stringify([...previous.addOnChoiceIds].sort((a, b) => a - b)) === JSON.stringify([...attempt.addOnChoiceIds].sort((a, b) => a - b)) &&
    previous.approverName === attempt.approverName && previous.optionSourceHash === attempt.optionSourceHash);
}

export async function lockEstimateOptions(tx: Prisma.TransactionClient, repairId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(5340::int, ${repairId}::int)`;
}

export async function assertNoUnansweredAlternatives(tx: Prisma.TransactionClient, repairId: number) {
  const set = await tx.estimateOptionSet.findUnique({ where: { repairId }, select: { isActive: true } });
  if (set?.isActive) throw new UnansweredEstimateOptionsError();
}

export class UnansweredEstimateOptionsError extends Error {
  constructor() { super("見積選択肢の回答が必要です。現行の承認操作では承認できません。"); }
}

export function canEditEstimateOptions(repair: { status: string; approvalStatus: string; estimateDocumentId: number | null }) {
  return repair.approvalStatus === "pending" && repair.estimateDocumentId == null &&
    !["キャンセル", "キャンセル返却", "修理不可返却", "納品済み"].includes(repair.status);
}
