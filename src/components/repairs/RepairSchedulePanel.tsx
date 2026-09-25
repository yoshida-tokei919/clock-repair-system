"use client";

import { useState } from "react";

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
                    <input type="date" value={values.scheduledDate} onChange={(event) => setValues({ ...values, scheduledDate: event.target.value })} className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2" />
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
                <button type="button" onClick={save} disabled={!changed || saving} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "保存中…" : "予定を保存"}</button>
                {message && <span role="status" className="text-sm text-green-700">{message}</span>}
                {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
            </div>
        </section>
    );
}
