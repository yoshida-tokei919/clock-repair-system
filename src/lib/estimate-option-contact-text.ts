import { selectedOptionTotal } from "@/lib/estimate-option-totals";
import { calculateTaxableAmounts, sumCustomerLines, type PricingTaxMode } from "@/lib/pricing-tax";

export const CONTACT_QUOTE_BEGIN = "【見積選択肢・自動生成ここから】";
export const CONTACT_QUOTE_END = "【見積選択肢・自動生成ここまで】";
export const TARGET_COMPANY_NAME_PART = "\u3042\u3057\u3084\u6642\u8a08\u5b9d\u77f3\u4fee\u7406\u7814\u7a76\u6240";

type Line = { itemName: string; quantity: number; unitPrice: number };
type Choice = { kind: string; name: string; notes?: string | null; lines: Line[] };

export function isTargetEstimateCustomer(customer: { type: string; prefix: string | null; companyName: string | null }, companyNamePart: string): boolean {
  return customer.type === "business" && customer.prefix === "A" && Boolean(companyNamePart && customer.companyName?.includes(companyNamePart));
}

function markedRange(note: string): { start: number; end: number } | null {
  const start = note.indexOf(CONTACT_QUOTE_BEGIN);
  const end = note.indexOf(CONTACT_QUOTE_END);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start || note.indexOf(CONTACT_QUOTE_BEGIN, start + CONTACT_QUOTE_BEGIN.length) >= 0 ||
      note.indexOf(CONTACT_QUOTE_END, end + CONTACT_QUOTE_END.length) >= 0) {
    throw new Error("見積案の自動生成区間が壊れています。手入力メモを保護するため保存を中止しました。");
  }
  return { start, end: end + CONTACT_QUOTE_END.length };
}

export function getGeneratedSectionText(existingNote: string | null): string | null {
  const note = existingNote ?? "";
  const range = markedRange(note);
  return range ? note.slice(range.start + CONTACT_QUOTE_BEGIN.length, range.end - CONTACT_QUOTE_END.length).replace(/^\n|\n$/g, "") : null;
}

export function replaceOrRemoveGeneratedSection(existingNote: string | null, text: string | null): string {
  const note = existingNote ?? "";
  const range = markedRange(note);
  if (text?.includes(CONTACT_QUOTE_BEGIN) || text?.includes(CONTACT_QUOTE_END)) throw new Error("見積案に区切り文字を含められません。");
  if (!range && !text) return note;
  const section = text ? `${CONTACT_QUOTE_BEGIN}\n${text}\n${CONTACT_QUOTE_END}` : "";
  if (!range) return `${section}${note ? `${section ? "\n\n" : ""}${note}` : ""}`;
  const before = note.slice(0, range.start).replace(/\n\n$/, "");
  const after = note.slice(range.end).replace(/^\n\n/, "");
  const manual = before && after ? `${before}\n\n${after}` : before || after;
  return `${section}${manual ? `${section ? "\n\n" : ""}${manual}` : ""}`;
}

type WatchDetails = {
  brand?: { name: string } | null; model?: { name: string } | null;
  reference?: { name: string } | null; caseReference?: { name: string } | null;
  serialNumber?: string | null;
};

export function buildEstimateContactText(input: {
  endUserName?: string | null; watch: WatchDetails; inquiryNumber?: string | null;
  commonLines: Line[]; mode: PricingTaxMode;
  optionSet?: { isActive: boolean; title?: string | null; notes?: string | null; choices: Choice[] } | null;
}): string | null {
  const { commonLines, mode, optionSet } = input;
  const hasChoices = Boolean(optionSet?.isActive && optionSet.choices.length);
  if (!hasChoices && commonLines.length === 0) return null;
  const name = input.endUserName?.trim().replace(/(?:様|さま)+$/, "") || "";
  const watch = input.watch;
  const identity = [
    name ? `${name}様` : null,
    [watch.brand?.name, watch.model?.name].filter(Boolean).join(" ") || null,
    watch.reference?.name ? `モデルRef：${watch.reference.name}` : null,
    watch.caseReference?.name ? `ケースRef：${watch.caseReference.name}` : null,
    watch.serialNumber?.trim() ? `シリアル番号：${watch.serialNumber.trim()}` : null,
  ].filter((value): value is string => Boolean(value));
  const quote = hasChoices ? buildEstimateOptionContactText({
    inquiryNumber: input.inquiryNumber, title: optionSet!.title, notes: optionSet!.notes,
    commonLines, choices: optionSet!.choices, mode,
  }) : [
    input.inquiryNumber ? `案件番号：${input.inquiryNumber}` : null,
    "【お見積明細】",
    ...commonLines.map(line => `${line.itemName} ×${line.quantity}：${sumCustomerLines([line]).toLocaleString("ja-JP")}円`),
    `税込合計：${calculateTaxableAmounts(sumCustomerLines(commonLines), mode).grossAmount.toLocaleString("ja-JP")}円`,
  ].filter(Boolean).join("\n");
  return [...identity, quote, "【お客様への連絡】"].join("\n");
}

export function buildEstimateOptionContactText(input: {
  inquiryNumber?: string | null; title?: string | null; notes?: string | null;
  commonLines: Line[]; choices: Choice[]; mode: PricingTaxMode;
}): string | null {
  if (input.choices.length === 0) return null;
  const money = (amount: number) => `${amount.toLocaleString("ja-JP")}円`;
  const common = input.commonLines.map(line => `${line.itemName} ×${line.quantity}：${money(sumCustomerLines([line]))}`);
  const lines = [
    input.inquiryNumber ? `案件番号：${input.inquiryNumber}` : null,
    input.title?.trim() || "お見積案",
    "【共通作業】", ...common,
    `共通作業 ${input.mode === "INCLUSIVE" ? "税込" : "税抜"}：${money(sumCustomerLines(input.commonLines))}`,
    input.notes?.trim() || null,
  ].filter((value): value is string => Boolean(value));
  const plans = input.choices.filter(choice => choice.kind === "PLAN");
  const addOns = input.choices.filter(choice => choice.kind === "ADD_ON");
  if (plans.length) {
    lines.push("【プラン（いずれか1つを選択）】");
    for (const choice of plans) {
      const total = selectedOptionTotal(input.commonLines, { lines: choice.lines }, [], input.mode);
      lines.push(`■ ${choice.name}`, ...choice.lines.map(line => `${line.itemName} ×${line.quantity}：${money(sumCustomerLines([line]))}`),
        `共通作業を含む税込合計：${money(total.grossAmount)}`);
      if (choice.notes?.trim()) lines.push(`条件：${choice.notes.trim()}`);
    }
  }
  if (addOns.length) {
    lines.push("【任意の追加作業（プランと組み合わせ可能）】");
    for (const choice of addOns) {
      lines.push(`□ ${choice.name}`, ...choice.lines.map(line => `${line.itemName} ×${line.quantity}：${money(sumCustomerLines([line]))}`),
        `追加額（${input.mode === "INCLUSIVE" ? "税込" : "税抜"}）：${money(sumCustomerLines(choice.lines))}`);
      if (choice.notes?.trim()) lines.push(`条件：${choice.notes.trim()}`);
    }
  }
  lines.push(plans.length
    ? "プランは1つお選びください。任意の追加作業は複数組み合わせられます。最終金額は選択内容に応じて確定します。"
    : "任意の追加作業は複数お選びいただけます。最終金額は選択内容に応じて確定します。");
  return lines.join("\n");
}

/** Presentation-only projection; internal delimiters never appear in LINE copy, shared page or PDF. */
export function displayEstimateOptionContactNote(existingNote: string | null | undefined): string {
  const note = existingNote ?? "";
  let range: { start: number; end: number } | null;
  try {
    range = markedRange(note);
  } catch {
    return "";
  }
  if (!range) return note.trim();
  const manualBefore = note.slice(0, range.start).trim();
  const generated = note.slice(range.start + CONTACT_QUOTE_BEGIN.length, range.end - CONTACT_QUOTE_END.length).trim();
  const manualAfter = note.slice(range.end).trim();
  return [manualBefore, generated, manualAfter].filter(Boolean).join("\n\n");
}

/** PDF shows structured estimate options already, so include only operator-authored notes. */
export function manualOnlyEstimateContactNote(existingNote: string | null | undefined): string {
  const note = existingNote ?? "";
  let range: { start: number; end: number } | null;
  try {
    range = markedRange(note);
  } catch {
    return "";
  }
  if (!range) return note.trim();
  return [note.slice(0, range.start).trim(), note.slice(range.end).trim()].filter(Boolean).join("\n\n");
}
