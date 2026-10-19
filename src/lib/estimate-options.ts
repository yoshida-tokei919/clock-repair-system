import type { Prisma } from "@prisma/client";
import { assertYen, calculateTaxableAmounts, sumCustomerLines, type PricingTaxMode } from "@/lib/pricing-tax";

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

export function selectedOptionTotal(
  commonLines: readonly { unitPrice: number; quantity: number }[],
  plan: { lines: readonly { unitPrice: number; quantity: number }[] } | null,
  addOns: readonly { lines: readonly { unitPrice: number; quantity: number }[] }[],
  mode: PricingTaxMode,
) {
  const commonAmount = sumCustomerLines(commonLines);
  const planAmount = plan ? sumCustomerLines(plan.lines) : 0;
  const addOnAmount = addOns.reduce((sum, addOn) => assertYen(sum + sumCustomerLines(addOn.lines)), 0);
  return { commonAmount, planAmount, addOnAmount,
    ...calculateTaxableAmounts(assertYen(commonAmount + planAmount + addOnAmount), mode) };
}

export function optionTotals(commonLines: readonly { unitPrice: number; quantity: number }[], choices: readonly { kind: string; lines: readonly { unitPrice: number; quantity: number }[] }[], mode: PricingTaxMode) {
  return choices.map((choice) => choice.kind === "PLAN"
    ? selectedOptionTotal(commonLines, choice, [], mode)
    : selectedOptionTotal([], null, [choice], mode));
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
