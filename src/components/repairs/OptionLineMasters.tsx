"use client";

import { useEffect, useMemo, useState } from "react";
import { getExternalRepairPricingRules, getInternalPartNameMasters, getPartsMatched, getPricingRules, getRepairWorkActions, getRepairWorkCategories } from "@/actions/master-actions";
import { getPartCategoriesByType, getPartNamesByCategory, type PartInputType } from "@/lib/part-input-options";
import { isRepairWorkActionApplicable, isRepairWorkTargetPartApplicable } from "@/lib/repair-work-selection";
import { laborCustomerUnitPrice, partCustomerUnitPrice, type PricingTaxMode } from "@/lib/pricing-tax";

export type MasterContext = { customerType: string; brandId: number | null; modelId: number | null; caliberId: number | null;
  movementMakerId: number | null; movementCaliberId: number | null; baseMovementMakerId: number | null; baseMovementCaliberId: number | null;
  reference: { name: string } | null; caseReference: { name: string } | null };
export type MasterLine = { lineType: "LABOR" | "PART"; itemNameSnapshot: string; displayNameSnapshot: string;
  workTypeSnapshot: "INTERNAL" | "EXTERNAL" | null; categoryNameSnapshot: string; actionNameSnapshot: string;
  targetPartNameSnapshot: string; detailLabelSnapshot: string; quantityUnit: string; unitPrice: number;
  partsMasterId: number | null; pricingRuleId: number | null; repairWorkCategoryId: number | null;
  repairWorkActionId: number | null; targetPartNameId: string | null };

type Category = Awaited<ReturnType<typeof getRepairWorkCategories>>[number];
type Action = Awaited<ReturnType<typeof getRepairWorkActions>>[number];
type Target = Awaited<ReturnType<typeof getInternalPartNameMasters>>[number];
type Rule = Awaited<ReturnType<typeof getPricingRules>>[number];
type Part = Awaited<ReturnType<typeof getPartsMatched>>[number];

export function OptionLineMasters({ line, context, mode, onChange, inputClass }: {
  line: MasterLine; context: MasterContext; mode: PricingTaxMode; onChange: (patch: Partial<MasterLine>) => void; inputClass: string;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loadError, setLoadError] = useState("");
  const workType = line.workTypeSnapshot ?? "INTERNAL";
  const partType: PartInputType = workType === "EXTERNAL" ? "part_external" : "part_internal";
  const category = categories.find(item => item.id === line.repairWorkCategoryId);
  const selectedTarget = targets.find(item => item.id === line.targetPartNameId);
  const [partCategoryKey, setPartCategoryKey] = useState(selectedTarget?.categoryKey ?? "");
  useEffect(() => { if (selectedTarget?.categoryKey) setPartCategoryKey(selectedTarget.categoryKey); }, [selectedTarget?.categoryKey]);

  useEffect(() => {
    let live = true;
    Promise.all([getRepairWorkCategories(), getRepairWorkActions(), getInternalPartNameMasters(true)])
      .then(([c, a, t]) => { if (live) { setCategories(c); setActions(a); setTargets(t); setLoadError(""); } })
      .catch(() => { if (live) setLoadError("マスタ候補を読み込めませんでした。"); });
    return () => { live = false; };
  }, []);

  const visibleTargets = useMemo(() => targets.filter(target => {
    if (line.lineType === "PART") return target.categoryKey === partCategoryKey &&
      (partType === "part_internal" ? ["part_internal", "internal", "interior"].includes(target.partType ?? "") :
        ["part_external", "external", "exterior"].includes(target.partType ?? ""));
    if (!category?.key || !target.key) return false;
    return isRepairWorkTargetPartApplicable(workType, category.key, { key: target.key, partType: target.partType, categoryKey: target.categoryKey });
  }), [targets, line.lineType, partCategoryKey, partType, category?.key, workType]);

  useEffect(() => {
    if (line.lineType !== "LABOR" || !context.brandId || !line.targetPartNameId || !line.repairWorkActionId ||
        (workType === "INTERNAL" && !line.repairWorkCategoryId)) { setRules([]); return; }
    let live = true;
    const lookup = workType === "EXTERNAL"
      ? getExternalRepairPricingRules({ customerType: context.customerType, brandId: context.brandId, modelId: context.modelId,
          targetPartNameId: line.targetPartNameId, repairWorkActionId: line.repairWorkActionId })
      : Promise.all([context.movementCaliberId, context.baseMovementCaliberId, context.caliberId, null]
          .filter((id, index, ids) => ids.indexOf(id) === index)
          .map(id => getPricingRules(context.brandId!, context.modelId ?? undefined, id ?? undefined,
            { customerType: context.customerType, repairWorkCategoryId: line.repairWorkCategoryId,
              targetPartNameId: line.targetPartNameId, repairWorkActionId: line.repairWorkActionId })))
          .then(groups => groups.flat());
    lookup.then(found => {
      if (!live) return;
      const seen = new Set<number>();
      const allowedCalibers = new Set([context.movementCaliberId, context.baseMovementCaliberId, context.caliberId, null]);
      setRules(found.filter(rule => rule.customerType === context.customerType && rule.targetPartNameId === line.targetPartNameId &&
        rule.repairWorkActionId === line.repairWorkActionId &&
        (workType === "EXTERNAL" ? (!rule.repairWorkCategoryId || rule.repairWorkCategoryId === line.repairWorkCategoryId) :
          rule.repairWorkCategoryId === line.repairWorkCategoryId) &&
        (workType === "EXTERNAL" || allowedCalibers.has(rule.caliberId)) &&
        !seen.has(rule.id) && Boolean(seen.add(rule.id))));
    }).catch(() => { if (live) setRules([]); });
    return () => { live = false; };
  }, [line.lineType, line.targetPartNameId, line.repairWorkActionId, line.repairWorkCategoryId, workType, context]);

  useEffect(() => {
    if (line.lineType !== "PART" || !line.targetPartNameId || !selectedTarget) { setParts([]); return; }
    let live = true;
    getPartsMatched(context.brandId ?? undefined, context.modelId ?? undefined, context.caliberId ?? undefined,
      undefined, context.movementMakerId ?? undefined, context.movementCaliberId ?? undefined,
      context.baseMovementMakerId ?? undefined, context.baseMovementCaliberId ?? undefined,
      undefined, selectedTarget.id, selectedTarget.nameJa, selectedTarget.displayJa,
      context.reference?.name, context.caseReference?.name)
      .then(found => { if (live) setParts(found); }).catch(() => { if (live) setParts([]); });
    return () => { live = false; };
  }, [line.lineType, line.targetPartNameId, selectedTarget, context]);

  const selectTarget = (id: string) => {
    const target = targets.find(item => item.id === id);
    onChange({ workTypeSnapshot: workType, targetPartNameId: target?.id ?? null, targetPartNameSnapshot: target?.name ?? "", partsMasterId: null,
      pricingRuleId: null, itemNameSnapshot: target?.name ?? line.itemNameSnapshot });
  };
  return <div className="sm:col-span-2 grid gap-2 sm:grid-cols-3">
    {loadError && <p role="alert" className="sm:col-span-3 text-red-700">{loadError}</p>}
    <label>内装・外装<select className={inputClass} value={workType} onChange={event => onChange({ workTypeSnapshot: event.target.value as "INTERNAL" | "EXTERNAL",
      repairWorkCategoryId: null, repairWorkActionId: null, targetPartNameId: null, partsMasterId: null, pricingRuleId: null,
      categoryNameSnapshot: "", actionNameSnapshot: "", targetPartNameSnapshot: "" })}>
      <option value="INTERNAL">内装</option><option value="EXTERNAL">外装</option></select></label>
    {line.lineType === "LABOR" ? <>
      <label>作業カテゴリ<select className={inputClass} value={line.repairWorkCategoryId ?? ""} onChange={event => {
        const next = categories.find(item => item.id === Number(event.target.value));
        onChange({ workTypeSnapshot: workType, repairWorkCategoryId: next?.id ?? null, categoryNameSnapshot: next?.name ?? "", targetPartNameId: null,
          targetPartNameSnapshot: "", pricingRuleId: null });
      }}><option value="">選択なし</option>{categories.filter(item => item.repairType === workType).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>対象部品<select className={inputClass} value={line.targetPartNameId ?? ""} onChange={event => selectTarget(event.target.value)}>
        <option value="">選択なし</option>{visibleTargets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>処置<select className={inputClass} value={line.repairWorkActionId ?? ""} onChange={event => {
        const next = actions.find(item => item.id === Number(event.target.value));
        onChange({ workTypeSnapshot: workType, repairWorkActionId: next?.id ?? null, actionNameSnapshot: next?.name ?? "", pricingRuleId: null });
      }}><option value="">選択なし</option>{actions.filter(item => item.key && isRepairWorkActionApplicable(workType, item.key)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="sm:col-span-2">価格ルール候補<select className={inputClass} value={line.pricingRuleId ?? ""} onChange={event => {
        const rule = rules.find(item => item.id === Number(event.target.value));
        onChange({ pricingRuleId: rule?.id ?? null, ...(rule ? { itemNameSnapshot: rule.suggestedWorkName,
          unitPrice: laborCustomerUnitPrice(rule.minPrice), quantityUnit: rule.defaultQuantityUnit ?? "",
          detailLabelSnapshot: rule.detailLabel ?? "" } : {}) });
      }}><option value="">候補から選択（任意）</option>{rules.map(rule => <option key={rule.id} value={rule.id}>{rule.suggestedWorkName} / {rule.minPrice.toLocaleString()}円</option>)}</select></label>
    </> : <>
      <label>部品カテゴリ<select className={inputClass} value={partCategoryKey} onChange={event => { setPartCategoryKey(event.target.value); onChange({ targetPartNameId: null,
        targetPartNameSnapshot: "", partsMasterId: null }); }}><option value="">選択なし</option>
        {getPartCategoriesByType(partType).map(item => <option key={item.key} value={item.key}>{item.labelJa}</option>)}</select></label>
      <label>部品名<select className={inputClass} value={line.targetPartNameId ?? ""} onChange={event => selectTarget(event.target.value)}>
        <option value="">選択なし</option>{getPartNamesByCategory(partCategoryKey).map(item => {
          const target = visibleTargets.find(candidate => candidate.key === item.key);
          return target ? <option key={target.id} value={target.id}>{item.displayJa ?? item.nameJa}</option> : null;
        })}</select></label>
      <label className="sm:col-span-3">実部品・在庫候補<select className={inputClass} value={line.partsMasterId ?? ""} onChange={event => {
        const part = parts.find(item => item.id === Number(event.target.value));
        onChange({ workTypeSnapshot: workType, partsMasterId: part?.id ?? null, ...(part ? { itemNameSnapshot: part.nameJp || part.name,
          unitPrice: partCustomerUnitPrice(part.retailPrice, mode), quantityUnit: part.defaultQuantityUnit ?? "" } : {}) });
      }}><option value="">実部品を指定しない（価格未確定・手入力）</option>{parts.map(part => <option key={part.id} value={part.id}>{part.nameJp || part.name} / {part.retailPrice.toLocaleString()}円</option>)}</select></label>
    </>}
    <p className="sm:col-span-3 text-xs text-zinc-600">候補を選ぶとマスタID・表示名・価格を控えます。候補がない場合は内容と単価を手入力できます。</p>
  </div>;
}
