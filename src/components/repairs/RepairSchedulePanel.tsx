"use client";

import { useEffect, useState } from "react";

type WorkTimePreview = {
    currentEstimatedWorkMinutes: number;
    estimatedTotalMinutes: number | null;
    roundedEstimatedWorkMinutes: number | null;
    previewStatus: "COMPLETE" | "INCOMPLETE" | "NO_STRUCTURED_LABOR";
    complete: boolean;
    unresolvedWorkUnitCount: number;
    unstructuredLaborLineCount: number;
    revision: string;
};

type ScheduleValues = {
    scheduledDate: string;
    estimatedWorkMinutes: string;
    deliveryDateExpected: string;
    scheduleLocked: boolean;
};

type Props = {
    repairId: number;
    scheduledDate: string | null;
    estimatedWorkMinutes: number;
    deliveryDateExpected: string | null;
    scheduleLocked: boolean;
    hasScheduleSegments: boolean;
    priorityScore: number;
};

function dateInputValue(value: string | null): string {
    return value ? value.slice(0, 10) : "";
}

export function RepairSchedulePanel(props: Props) {
    const initial: ScheduleValues = {
        scheduledDate: dateInputValue(props.scheduledDate),
        estimatedWorkMinutes: String(props.estimatedWorkMinutes),
        deliveryDateExpected: dateInputValue(props.deliveryDateExpected),
        scheduleLocked: props.scheduleLocked,
    };
    const [values, setValues] = useState<ScheduleValues>(initial);
    const [saved, setSaved] = useState<ScheduleValues>(initial);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [preview, setPreview] = useState<WorkTimePreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [previewMessage, setPreviewMessage] = useState("");
    const [previewError, setPreviewError] = useState("");

    async function loadPreview() {
        setPreviewLoading(true);
        try {
            const response = await fetch(`/api/repairs/${props.repairId}/work-time-preview`, { cache: "no-store" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "作業時間プレビューを取得できませんでした。");
            setPreview(result);
            setPreviewError("");
        } catch (cause) {
            setPreview(null);
            setPreviewError(cause instanceof Error ? cause.message : "作業時間プレビューを取得できませんでした。");
        } finally {
            setPreviewLoading(false);
        }
    }

    useEffect(() => { void loadPreview(); }, [props.repairId]);

    async function applyPreview() {
        if (!preview || !preview.complete || preview.roundedEstimatedWorkMinutes === null ||
            !Number.isSafeInteger(preview.roundedEstimatedWorkMinutes) ||
            preview.roundedEstimatedWorkMinutes <= 0 || preview.roundedEstimatedWorkMinutes > 2147483647) return;
        setApplying(true);
        setPreviewMessage("");
        setPreviewError("");
        try {
            const response = await fetch(`/api/repairs/${props.repairId}/work-time-preview/apply`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ revision: preview.revision }),
            });
            const result = await response.json();
            if (response.status === 409) {
                await loadPreview();
                setPreviewMessage("プレビューが変更されました。内容を確認してから再度採用してください。");
                return;
            }
            if (!response.ok) throw new Error(result.error || "推定時間を採用できませんでした。");
            const minutes = String(result.estimatedWorkMinutes);
            setValues(current => ({ ...current, estimatedWorkMinutes: minutes }));
            setSaved(current => ({ ...current, estimatedWorkMinutes: minutes }));
            await loadPreview();
            setPreviewMessage("推定時間を保存しました。");
        } catch (cause) {
            setPreviewError(cause instanceof Error ? cause.message : "推定時間を採用できませんでした。");
        } finally {
            setApplying(false);
        }
    }

    async function save() {
        setError("");
        setMessage("");
        const minutes = Number(values.estimatedWorkMinutes);
        if (!/^\d+$/.test(values.estimatedWorkMinutes) || !Number.isInteger(minutes) || minutes > 2147483647) {
            setError("想定作業時間は0以上の整数で入力してください。");
            return;
        }
        setSaving(true);
        try {
            const response = await fetch(`/api/repairs/${props.repairId}/schedule`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scheduledDate: values.scheduledDate || null,
                    estimatedWorkMinutes: minutes,
                    deliveryDateExpected: values.deliveryDateExpected || null,
                    scheduleLocked: values.scheduleLocked,
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "保存に失敗しました。");
            const next: ScheduleValues = {
                scheduledDate: dateInputValue(result.repair.scheduledDate),
                estimatedWorkMinutes: String(result.repair.estimatedWorkMinutes),
                deliveryDateExpected: dateInputValue(result.repair.deliveryDateExpected),
                scheduleLocked: result.repair.scheduleLocked,
            };
            setValues(next);
            setSaved(next);
            setMessage("スケジュールを保存しました。");
            await loadPreview();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "保存に失敗しました。");
        } finally {
            setSaving(false);
        }
    }

    const changed = JSON.stringify(values) !== JSON.stringify(saved);

    return (
        <section aria-labelledby="repair-schedule-heading" className="mx-auto max-w-7xl bg-white border border-zinc-200 rounded-lg p-5 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                    <h2 id="repair-schedule-heading" className="text-lg font-semibold text-zinc-900">作業スケジュール</h2>
                    <p className="text-sm text-zinc-600">この案件の予定を個別に保存します。</p>
                </div>
                <div className="text-sm text-zinc-700">優先度スコア: <strong>{props.priorityScore}</strong> <span className="text-zinc-500">（参照のみ）</span></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium text-zinc-700">作業予定日
                    <input type="date" value={values.scheduledDate} onChange={(event) => setValues({ ...values, scheduledDate: event.target.value })} disabled={props.hasScheduleSegments} className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 disabled:bg-zinc-100" />
                    {props.hasScheduleSegments && <span className="mt-1 block text-xs font-normal text-zinc-500">分割予定があるため、代表日はここで変更できません。Scheduler v2で予定を確認してください。</span>}
                </label>
                <label className="block text-sm font-medium text-zinc-700">想定作業時間（分）
                    <input type="number" min="0" step="1" value={values.estimatedWorkMinutes} onChange={(event) => setValues({ ...values, estimatedWorkMinutes: event.target.value })} className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2" />
                </label>
                <label className="block text-sm font-medium text-zinc-700">納品予定日
                    <input type="date" value={values.deliveryDateExpected} onChange={(event) => setValues({ ...values, deliveryDateExpected: event.target.value })} className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2" />
                </label>
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={values.scheduleLocked} onChange={(event) => setValues({ ...values, scheduleLocked: event.target.checked })} className="mt-1" />
                <span>予定日を固定する <span className="block text-zinc-500">今後の自動スケジュールで、この案件の予定日を変更しない設定です。</span></span>
            </label>
            <div className="mt-4 flex items-center gap-3">
                <button type="button" onClick={save} disabled={!changed || saving || applying} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "保存中…" : "予定を保存"}</button>
                {message && <span role="status" className="text-sm text-green-700">{message}</span>}
                {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
            </div>
            <div className="mt-5 border-t border-zinc-200 pt-4 text-sm text-zinc-700">
                <h3 className="font-semibold text-zinc-900">作業時間プレビュー</h3>
                {previewLoading && <p className="mt-2">計算中…</p>}
                {preview && <div className="mt-2 space-y-1">
                    <p>現在の保存値: {preview.currentEstimatedWorkMinutes}分</p>
                    <p>プレビュー合計: {preview.estimatedTotalMinutes === null ? "算出不可" : `${preview.estimatedTotalMinutes}分`}</p>
                    <p>採用時の保存値: {preview.roundedEstimatedWorkMinutes === null ? "算出不可" : `${preview.roundedEstimatedWorkMinutes}分`}</p>
                    <p>状態: <strong>{preview.previewStatus}</strong></p>
                    {preview.previewStatus !== "COMPLETE" && <p className="text-amber-700">
                        {preview.previewStatus === "NO_STRUCTURED_LABOR" ? "構造化された技術料がありません。" :
                            `未解決の作業単位 ${preview.unresolvedWorkUnitCount}件、未構造化の技術料 ${preview.unstructuredLaborLineCount}件。`}
                    </p>}
                    {preview.complete && (preview.roundedEstimatedWorkMinutes === null ||
                        !Number.isSafeInteger(preview.roundedEstimatedWorkMinutes) ||
                        preview.roundedEstimatedWorkMinutes <= 0 || preview.roundedEstimatedWorkMinutes > 2147483647) &&
                        <p className="text-amber-700">保存できる正の整数分ではありません。</p>}
                </div>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={applyPreview} disabled={!preview || !preview.complete ||
                        preview.roundedEstimatedWorkMinutes === null || !Number.isSafeInteger(preview.roundedEstimatedWorkMinutes) ||
                        preview.roundedEstimatedWorkMinutes <= 0 || preview.roundedEstimatedWorkMinutes > 2147483647 ||
                        previewLoading || applying || saving}
                        className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">
                        {applying ? "採用中…" : "推定時間を採用"}
                    </button>
                    <button type="button" onClick={() => { setPreviewMessage(""); void loadPreview(); }} disabled={previewLoading || applying}
                        className="rounded-md border border-zinc-300 px-3 py-2 disabled:opacity-50">再プレビュー</button>
                    {previewMessage && <span role="status" className="text-green-700">{previewMessage}</span>}
                    {previewError && <span role="alert" className="text-red-700">{previewError}</span>}
                </div>
            </div>
        </section>
    );
}
