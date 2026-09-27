"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RepairWorkTimeStandard, SchedulerActivitySetting, SchedulerSetting } from "@prisma/client";
import { AUTO_ACTIVITY_TYPES } from "@/lib/scheduler-settings-domain";
import { isRepairWorkActionApplicable, isRepairWorkTargetPartApplicable } from "@/lib/repair-work-selection";

type Masters = {
  categories: { id: number; repairType: "INTERNAL" | "EXTERNAL"; key: string; name: string }[];
  actions: { id: number; key: string; name: string }[];
  parts: { id: string; key: string; partType: string; categoryKey: string; name: string; categoryName: string }[];
};
type Data = { setting: SchedulerSetting; activities: SchedulerActivitySetting[]; standards: RepairWorkTimeStandard[]; masters: Masters };
type StandardDraft = {
  id: number | null; repairType: "INTERNAL" | "EXTERNAL"; categoryId: string;
  targetPartNameId: string; actionId: string; detailLabel: string; driveType: string; standardMinutes: string;
};
const emptyDraft = (): StandardDraft => ({ id: null, repairType: "INTERNAL", categoryId: "", targetPartNameId: "",
  actionId: "", detailLabel: "", driveType: "", standardMinutes: "" });
const activityNames: Record<string, string> = {
  ESTIMATE: "見積", INTAKE: "受付", INQUIRY: "問い合わせ", CUSTOMER_CONTACT: "顧客連絡",
  PARTS_ORDER: "部品発注", SHIPPING: "発送", ADMIN: "事務", OTHER: "その他",
};
const aggregationNames: Record<string, string> = { MEAN: "平均", MEDIAN: "中央値", P80: "80パーセンタイル" };
const inputClass = "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm";
const buttonClass = "rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50";

async function api(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}

function NumberField({ label, value, onChange, min = 0, nullable = false }: {
  label: string; value: number | null; onChange: (value: number | null) => void; min?: number; nullable?: boolean;
}) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>
    <input className={inputClass} type="number" min={min} step="1" value={value ?? ""}
      onChange={event => onChange(event.target.value === "" && nullable ? null : Number(event.target.value))} />
  </label>;
}

function AggregationSelect({ value, onChange }: { value: string; onChange: (value: "MEAN" | "MEDIAN" | "P80") => void }) {
  return <select className={inputClass} value={value} onChange={event => onChange(event.target.value as "MEAN" | "MEDIAN" | "P80")}>
    {Object.entries(aggregationNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select>;
}

export default function SchedulerSettingsEditor() {
  const [data, setData] = useState<Data | null>(null);
  const [setting, setSetting] = useState<SchedulerSetting | null>(null);
  const [activities, setActivities] = useState<SchedulerActivitySetting[]>([]);
  const [draft, setDraft] = useState<StandardDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const next = await api("/api/settings/scheduler") as Data;
    setData(next); setSetting(next.setting); setActivities(next.activities);
  }, []);
  useEffect(() => { reload().catch(err => setError(err.message)); }, [reload]);
  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); await reload(); setMessage(success); }
    catch (err) { setError(err instanceof Error ? err.message : "処理に失敗しました。"); }
    finally { setBusy(false); }
  }
  const patchSetting = (patch: Partial<SchedulerSetting>) => setSetting(current => current ? { ...current, ...patch } : current);
  const patchActivity = (type: string, patch: Partial<SchedulerActivitySetting>) =>
    setActivities(current => current.map(row => row.activityType === type ? { ...row, ...patch } : row));

  const selectedCategory = data?.masters.categories.find(row => String(row.id) === draft.categoryId);
  const categories = data?.masters.categories.filter(row => row.repairType === draft.repairType) ?? [];
  const actions = useMemo(() => data?.masters.actions.filter(row => isRepairWorkActionApplicable(draft.repairType, row.key)) ?? [], [data, draft.repairType]);
  const parts = useMemo(() => selectedCategory
    ? data?.masters.parts.filter(row => isRepairWorkTargetPartApplicable(draft.repairType, selectedCategory.key, row)) ?? []
    : [], [data, draft.repairType, selectedCategory]);
  function editStandard(row: RepairWorkTimeStandard) {
    setDraft({ id: row.id, repairType: row.repairType, categoryId: String(row.categoryId),
      targetPartNameId: row.targetPartNameId ?? "", actionId: row.actionId === null ? "" : String(row.actionId),
      detailLabel: row.detailLabel ?? "", driveType: row.driveType ?? "", standardMinutes: String(row.standardMinutes) });
    document.getElementById("standard-editor")?.scrollIntoView({ behavior: "smooth" });
  }
  async function saveStandard() {
    const body = { repairType: draft.repairType, categoryId: Number(draft.categoryId),
      targetPartNameId: draft.targetPartNameId || null, actionId: draft.actionId ? Number(draft.actionId) : null,
      detailLabel: draft.detailLabel, driveType: draft.driveType || null, standardMinutes: Number(draft.standardMinutes) };
    await run(async () => {
      await api(draft.id === null ? "/api/settings/scheduler/standards" : `/api/settings/scheduler/standards/${draft.id}`,
        draft.id === null ? "POST" : "PUT", body);
      setDraft(emptyDraft());
    }, draft.id === null ? "標準作業時間を追加しました。" : "標準作業時間を更新しました。");
  }
  const nameForCategory = (id: number) => data?.masters.categories.find(row => row.id === id)?.name ?? `カテゴリID ${id}`;
  const nameForAction = (id: number | null) => id === null ? "—" : data?.masters.actions.find(row => row.id === id)?.name ?? `処置ID ${id}`;
  const nameForPart = (id: string | null) => id === null ? "—" : data?.masters.parts.find(row => row.id === id)?.name ?? `部品ID ${id}`;

  return <main className="mx-auto max-w-7xl space-y-8 p-6 text-zinc-900">
    <header><h1 className="text-2xl font-bold">スケジューラ設定</h1>
      <p className="mt-2 text-sm text-zinc-600">作業時間の標準値と実績学習条件を管理します。設定は現在の予定や修理案件の推定時間へ自動反映されません。</p>
    </header>
    {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    {!data || !setting ? <p>{error ? "設定を表示できません。" : "設定を読み込み中です。"}</p> : <>
      <section className="space-y-4 rounded border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">共通・修理の設定</h2>
        <p className="text-sm text-zinc-600">AUTOは計測実績から時間を採用し、MANUALは登録した標準時間を使います。最低件数に達するまでは実績を採用しません。十分な件数に達する前後で集計方法を分けます。</p>
        <div className="grid gap-4 md:grid-cols-3">
          <NumberField label="標準1日作業時間（分）" value={setting.standardDailyMinutes} min={1} onChange={v => patchSetting({ standardDailyMinutes: v! })} />
          <NumberField label="日次予定確認時間（分）" value={setting.dailyScheduleReviewMinutes} onChange={v => patchSetting({ dailyScheduleReviewMinutes: v! })} />
          <label className="text-sm"><span className="mb-1 block font-medium">修理の学習モード</span><select className={inputClass} value={setting.repairLearningMode} onChange={e => patchSetting({ repairLearningMode: e.target.value as "AUTO" | "MANUAL" })}><option value="AUTO">AUTO（実績学習）</option><option value="MANUAL">MANUAL（一般標準）</option></select></label>
          <NumberField label="修理の最低サンプル数" value={setting.repairLearningMinimumSamples} min={1} onChange={v => patchSetting({ repairLearningMinimumSamples: v! })} />
          <NumberField label="修理の十分なサンプル数" value={setting.repairFullSampleThreshold} min={1} onChange={v => patchSetting({ repairFullSampleThreshold: v! })} />
          <NumberField label="修理の集計期間（月）" value={setting.repairLookbackMonths} min={1} onChange={v => patchSetting({ repairLookbackMonths: v! })} />
          <label className="text-sm"><span className="mb-1 block font-medium">少数実績の集計方法</span><AggregationSelect value={setting.repairEarlyAggregationMethod} onChange={v => patchSetting({ repairEarlyAggregationMethod: v })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">十分な実績の集計方法</span><AggregationSelect value={setting.defaultAggregationMethod} onChange={v => patchSetting({ defaultAggregationMethod: v })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">外れ値処理</span><select className={inputClass} value={setting.repairOutlierMethod} onChange={e => patchSetting({ repairOutlierMethod: e.target.value as "NONE" | "IQR" })}><option value="NONE">なし（全サンプル）</option><option value="IQR">IQR（四分位範囲から外れる値を除外）</option></select></label>
        </div>
        <p className="text-xs text-zinc-600">集計期間は直近何ヶ月の実績を見るかを指定します。外れ値処理IQRは極端な計測値の影響を抑えます。標準1日作業時間と予定確認時間は現行WorkCalendar容量には接続されていません。</p>
        <button className={buttonClass} disabled={busy} onClick={() => run(() => api("/api/settings/scheduler", "PUT", {
          standardDailyMinutes: setting.standardDailyMinutes, dailyScheduleReviewMinutes: setting.dailyScheduleReviewMinutes,
          repairLearningMode: setting.repairLearningMode, repairLearningMinimumSamples: setting.repairLearningMinimumSamples,
          repairFullSampleThreshold: setting.repairFullSampleThreshold, repairEarlyAggregationMethod: setting.repairEarlyAggregationMethod,
          defaultAggregationMethod: setting.defaultAggregationMethod, repairLookbackMonths: setting.repairLookbackMonths,
          repairOutlierMethod: setting.repairOutlierMethod,
        }), "共通設定を保存しました。")}>共通設定を保存</button>
      </section>

      <section className="space-y-4 rounded border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">修理以外の業務</h2>
        <p className="text-sm text-zinc-600">手動標準時間の空欄は「未設定」です（0分ではありません）。集計期間は直近何ヶ月の実績を見るかを指定します。代替集計期間は主期間のサンプルが最低件数に届かない場合に使い、空欄は「なし」です。AUTO学習に対応する区分は見積・問い合わせ・部品発注のみです。</p>
        <p className="text-sm text-zinc-600">日次予約時間は1日の作業容量から確保する分数です。特に問い合わせの日次予約時間は、問い合わせ1件あたりの作業時間ではありません。</p>
        <div className="space-y-5">{activities.map(row => <div key={row.activityType} className="rounded border p-4">
          <h3 className="mb-3 font-semibold">{activityNames[row.activityType] ?? row.activityType}</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <NumberField label="手動標準時間（分、空欄可）" value={row.manualStandardMinutes} min={1} nullable onChange={v => patchActivity(row.activityType, { manualStandardMinutes: v })} />
            <NumberField label="日次予約時間（分）" value={row.dailyReservedMinutes} onChange={v => patchActivity(row.activityType, { dailyReservedMinutes: v! })} />
            <label className="text-sm"><span className="mb-1 block font-medium">学習モード</span><select className={inputClass} value={row.learningMode} onChange={e => patchActivity(row.activityType, { learningMode: e.target.value as "MANUAL" | "AUTO" })}><option value="MANUAL">MANUAL</option>{AUTO_ACTIVITY_TYPES.some(type => type === row.activityType) && <option value="AUTO">AUTO</option>}{row.learningMode === "AUTO" && !AUTO_ACTIVITY_TYPES.some(type => type === row.activityType) && <option value="AUTO" disabled>AUTO（非対応・既存値）</option>}</select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">集計方法</span><AggregationSelect value={row.aggregationMethod} onChange={v => patchActivity(row.activityType, { aggregationMethod: v })} /></label>
            <NumberField label="集計期間（月）" value={row.lookbackMonths} min={1} onChange={v => patchActivity(row.activityType, { lookbackMonths: v! })} />
            <NumberField label="代替集計期間（月、空欄可）" value={row.fallbackLookbackMonths} min={1} nullable onChange={v => patchActivity(row.activityType, { fallbackLookbackMonths: v })} />
            <NumberField label="最低サンプル数" value={row.minimumSamples} min={1} onChange={v => patchActivity(row.activityType, { minimumSamples: v! })} />
          </div>
          <button className={`${buttonClass} mt-3`} disabled={busy} onClick={() => run(() => api("/api/settings/scheduler/activities", "PUT", {
            activityType: row.activityType, manualStandardMinutes: row.manualStandardMinutes, dailyReservedMinutes: row.dailyReservedMinutes,
            learningMode: row.learningMode, aggregationMethod: row.aggregationMethod, lookbackMonths: row.lookbackMonths,
            fallbackLookbackMonths: row.fallbackLookbackMonths, minimumSamples: row.minimumSamples,
          }), `${activityNames[row.activityType]}の設定を保存しました。`)}>この業務を保存</button>
        </div>)}</div>
      </section>

      <section className="space-y-4 rounded border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">修理の一般標準時間</h2>
        <p className="text-sm text-zinc-600">実績が不足するときに使う一般条件の標準時間です。空欄の条件は指定しません。初期行はありません。条件の優先順位や時計ブランド・モデル・Ref・Cal別の採用判定はこの画面では扱いません。</p>
        <div className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm"><thead><tr className="border-b bg-zinc-50">{["内外装", "カテゴリ", "対象部品", "処置", "詳細", "駆動方式", "時間（分）", "操作"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{data.standards.map(row => <tr key={row.id} className="border-b"><td className="p-2">{row.repairType === "INTERNAL" ? "内装" : "外装"}</td><td className="p-2">{nameForCategory(row.categoryId)}</td><td className="p-2">{nameForPart(row.targetPartNameId)}</td><td className="p-2">{nameForAction(row.actionId)}</td><td className="p-2">{row.detailLabel ?? "—"}</td><td className="p-2">{row.driveType ?? "—"}</td><td className="p-2">{row.standardMinutes}</td><td className="whitespace-nowrap p-2"><button className="text-blue-700 underline" onClick={() => editStandard(row)}>編集</button><button className="ml-3 text-red-700 underline" disabled={busy} onClick={() => { if (window.confirm("この標準作業時間を削除しますか？")) run(() => api(`/api/settings/scheduler/standards/${row.id}`, "DELETE"), "標準作業時間を削除しました。"); }}>削除</button></td></tr>)}
            {data.standards.length === 0 && <tr><td colSpan={8} className="p-4 text-zinc-500">登録された標準作業時間はありません。</td></tr>}
          </tbody></table></div>
        <div id="standard-editor" className="space-y-3 border-t pt-4"><h3 className="font-semibold">{draft.id === null ? "標準時間を追加" : `標準時間 #${draft.id} を編集`}</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm"><span className="mb-1 block font-medium">内外装</span><select className={inputClass} value={draft.repairType} onChange={e => setDraft(current => ({ ...current, repairType: e.target.value as "INTERNAL" | "EXTERNAL", categoryId: "", targetPartNameId: "", actionId: "", driveType: "" }))}><option value="INTERNAL">内装</option><option value="EXTERNAL">外装</option></select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">作業カテゴリ</span><select className={inputClass} value={draft.categoryId} onChange={e => setDraft(current => ({ ...current, categoryId: e.target.value, targetPartNameId: "" }))}><option value="">選択してください</option>{categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">対象部品名（任意）</span><select className={inputClass} value={draft.targetPartNameId} onChange={e => setDraft(current => ({ ...current, targetPartNameId: e.target.value }))}><option value="">指定なし</option>{parts.map(row => <option key={row.id} value={row.id}>{row.name}（{row.categoryName}）</option>)}</select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">処置（任意）</span><select className={inputClass} value={draft.actionId} onChange={e => setDraft(current => ({ ...current, actionId: e.target.value }))}><option value="">指定なし</option>{actions.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">詳細ラベル（任意）</span><input className={inputClass} value={draft.detailLabel} onChange={e => setDraft(current => ({ ...current, detailLabel: e.target.value }))} /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">駆動方式（内装のみ）</span><select className={inputClass} value={draft.driveType} disabled={draft.repairType === "EXTERNAL"} onChange={e => setDraft(current => ({ ...current, driveType: e.target.value }))}><option value="">指定なし</option><option value="QUARTZ">クォーツ</option><option value="MECHANICAL">機械式</option><option value="UNKNOWN">不明</option></select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">標準作業時間（分）</span><input className={inputClass} type="number" min="1" step="1" value={draft.standardMinutes} onChange={e => setDraft(current => ({ ...current, standardMinutes: e.target.value }))} /></label>
          </div>
          <div className="flex gap-3"><button className={buttonClass} disabled={busy} onClick={saveStandard}>{draft.id === null ? "追加" : "更新"}</button>{draft.id !== null && <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setDraft(emptyDraft())}>編集を解除</button>}</div>
        </div>
      </section>
    </>}
  </main>;
}
