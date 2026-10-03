"use client";

import { useMemo, useRef, useState } from "react";

type Preference = {
  requestedDeliveryDate: string | null;
  requestedDeliveryTimeSlot: string;
  respondedAt: string;
};
type State = {
  editable: boolean;
  applicationStatus: string;
  preference: Preference | null;
};
type Mode = "" | "NONE" | "DATE" | "TIME" | "DATE_TIME";
type TimeOption = { value: string; label: string };

function modeFromPreference(preference: Preference | null): Mode {
  if (!preference) return "";
  const hasDate = Boolean(preference.requestedDeliveryDate);
  const hasTime = preference.requestedDeliveryTimeSlot !== "指定なし";
  if (hasDate && hasTime) return "DATE_TIME";
  if (hasDate) return "DATE";
  if (hasTime) return "TIME";
  return "NONE";
}

const modeLabels: Record<Exclude<Mode, "">, string> = {
  NONE: "希望なし",
  DATE: "日付を指定",
  TIME: "時間帯を指定",
  DATE_TIME: "日付と時間帯を指定",
};
function summary(mode: Mode, date: string, timeSlot: string) {
  if (!mode) return "";
  if (mode === "NONE") return "配達日時の希望なし";
  if (mode === "DATE") return `配達希望日: ${date}`;
  if (mode === "TIME") return `配達希望時間帯: ${timeSlot}`;
  return `配達希望日: ${date} / 時間帯: ${timeSlot}`;
}

export function DeliveryPreferenceForm({
  token,
  initial,
  timeOptions,
}: {
  token: string;
  initial: State;
  timeOptions: TimeOption[];
}) {
  const initialMode = modeFromPreference(initial.preference);
  const [state, setState] = useState(initial);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [date, setDate] = useState(initial.preference?.requestedDeliveryDate ?? "");
  const [timeSlot, setTimeSlot] = useState(
    initial.preference && initial.preference.requestedDeliveryTimeSlot !== "指定なし"
      ? initial.preference.requestedDeliveryTimeSlot : "",
  );
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(Boolean(initial.preference));
  const inFlight = useRef(false);
  const canReview = useMemo(() => {
    if (!state.editable || !mode || saving) return false;
    if (mode === "NONE") return true;
    if (mode === "DATE") return Boolean(date);
    if (mode === "TIME") return Boolean(timeSlot);
    return Boolean(date && timeSlot);
  }, [state.editable, mode, date, timeSlot, saving]);

  function chooseMode(next: Exclude<Mode, "">) {
    setMode(next);
    setConfirming(false);
    setSaved(false);
    setError(null);
  }

  async function submit() {
    if (!canReview || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/customer/delivery/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          date: mode === "DATE" || mode === "DATE_TIME" ? date : "",
          timeSlot: mode === "TIME" || mode === "DATE_TIME" ? timeSlot : "",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true) {
        throw new Error(data?.error || "回答を保存できませんでした。");
      }
      setState(data as State);
      setConfirming(false);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回答を保存できませんでした。");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  if (!state.editable) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      発送準備が進んでいるため、このページから配達希望を変更できません。変更をご希望の場合はLINEでご連絡ください。
    </div>;
  }

  return <div className="space-y-5">
    {saved && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      回答を受け付けました。内容を変更する場合は、発送準備が進む前であればこのページから再回答できます。
    </div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

    <fieldset className="space-y-3">
      <legend className="mb-2 text-base font-semibold">配達日時のご希望を選択してください</legend>
      {(Object.keys(modeLabels) as Exclude<Mode, "">[]).map(value => <label key={value}
        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 ${mode === value ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}>
        <input type="radio" name="delivery-mode" value={value} checked={mode === value}
          onChange={() => chooseMode(value)} className="h-5 w-5" />
        <span className="font-medium">{modeLabels[value]}</span>
      </label>)}
    </fieldset>

    {(mode === "DATE" || mode === "DATE_TIME") && <label className="block space-y-2">
      <span className="font-medium">配達希望日</span>
      <input type="date" value={date} onChange={event => { setDate(event.target.value); setConfirming(false); setSaved(false); }}
        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base" />
    </label>}
    {(mode === "TIME" || mode === "DATE_TIME") && <label className="block space-y-2">
      <span className="font-medium">配達希望時間帯</span>
      <select value={timeSlot} onChange={event => { setTimeSlot(event.target.value); setConfirming(false); setSaved(false); }}
        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
        <option value="">時間帯を選択してください</option>
        {timeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>}

    {!confirming ? <button type="button" disabled={!canReview}
      onClick={() => { setConfirming(true); setError(null); }}
      className="min-h-12 w-full rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
      回答内容を確認
    </button> : <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <p className="font-semibold">この内容で回答します</p>
      <p className="text-sm">{summary(mode, date, timeSlot)}</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={saving} onClick={() => setConfirming(false)}
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 font-medium">戻る</button>
        <button type="button" disabled={saving} onClick={() => void submit()}
          className="min-h-12 rounded-xl bg-blue-600 px-3 font-semibold text-white disabled:bg-slate-300">
          {saving ? "保存中…" : "この内容で回答する"}
        </button>
      </div>
    </div>}
  </div>;
}
