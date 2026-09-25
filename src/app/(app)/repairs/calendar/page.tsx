"use client";

import { useEffect, useState } from "react";

type CalendarException = { date: string; availableMinutes: number; note: string | null };
type CalendarResponse = { month: string; defaultAvailableMinutes: number; exceptions: CalendarException[] };

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

function currentMonthInJapan(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  return `${year}-${month}`;
}

function monthLabel(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return `${year}年${number}月`;
}

function moveMonth(month: string, amount: number): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function monthDays(month: string): (string | null)[] {
  const first = new Date(`${month}-01T00:00:00.000Z`);
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  const count = next.getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  return [
    ...Array<string | null>(offset).fill(null),
    ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  ];
}

function formatHours(minutes: number): string {
  if (minutes % 30 === 0) return `${minutes / 60}h`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

export default function WorkCalendarPage() {
  const [month, setMonth] = useState(currentMonthInJapan);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [defaultMinutes, setDefaultMinutes] = useState(480);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hours, setHours] = useState("8");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSelectedDate(null);
    setExceptions([]);
    setError("");
    setMessage("");
    fetch(`/api/work-calendar?month=${month}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "カレンダーを取得できませんでした。");
        return body as CalendarResponse;
      })
      .then(body => {
        setExceptions(body.exceptions);
        setDefaultMinutes(body.defaultAvailableMinutes);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "カレンダーを取得できませんでした。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [month]);

  function selectDate(date: string) {
    const exception = exceptions.find(row => row.date === date);
    setSelectedDate(date);
    setHours(String((exception?.availableMinutes ?? defaultMinutes) / 60));
    setNote(exception?.note ?? "");
    setError("");
    setMessage("");
  }

  async function save() {
    if (!selectedDate || saving) return;
    const parsedHours = Number(hours);
    const minutes = parsedHours * 60;
    if (hours.trim() === "" || !Number.isFinite(parsedHours) || parsedHours < 0 || parsedHours > 24 || Math.abs(minutes - Math.round(minutes)) > 0.000001) {
      setError("時間は0〜24の範囲で、分に換算できる値を入力してください。");
      return;
    }
    const trimmedNote = note.trim();
    if (trimmedNote.length > 200) {
      setError("メモは200文字以内で入力してください。");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/work-calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, availableMinutes: Math.round(minutes), note: trimmedNote || null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存できませんでした。");
      setExceptions(previous => {
        const others = previous.filter(row => row.date !== selectedDate);
        return body.isException
          ? [...others, { date: selectedDate, availableMinutes: body.availableMinutes, note: body.note }]
          : others;
      });
      setHours(String(body.availableMinutes / 60));
      setNote(body.note ?? "");
      setMessage(body.isException ? "保存しました。" : "標準の8時間に戻しました。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  const rows = new Map(exceptions.map(row => [row.date, row]));

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">作業カレンダー</h1>
      <p className="mt-2 text-sm text-slate-600">通常日は8時間です。休み・半日・私用など、例外の日だけ登録します。</p>

      <div className="mt-6 flex items-center justify-between gap-4">
        <button type="button" disabled={saving || month === "0001-01"} onClick={() => setMonth(moveMonth(month, -1))} className="rounded border px-3 py-2 hover:bg-slate-50 disabled:opacity-50" aria-label="前月">前月</button>
        <h2 className="text-xl font-semibold">{monthLabel(month)}</h2>
        <button type="button" disabled={saving || month === "9999-12"} onClick={() => setMonth(moveMonth(month, 1))} className="rounded border px-3 py-2 hover:bg-slate-50 disabled:opacity-50" aria-label="次月">次月</button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-sm">
        {WEEKDAYS.map(day => <div key={day} className="py-2 font-semibold text-slate-600">{day}</div>)}
        {monthDays(month).map((date, index) => {
          if (!date) return <div key={`blank-${index}`} />;
          const exception = rows.get(date);
          return (
            <button key={date} type="button" disabled={loading || saving || Boolean(error && !selectedDate)} onClick={() => selectDate(date)}
              aria-label={`${date} ${formatHours(exception?.availableMinutes ?? defaultMinutes)}${exception?.note ? ` メモあり` : ""}`}
              aria-pressed={selectedDate === date}
              className={`min-h-20 rounded border p-1 text-left hover:bg-blue-50 disabled:opacity-50 sm:p-2 ${selectedDate === date ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
              <span className="block font-semibold">{Number(date.slice(-2))}</span>
              <span className={`block text-sm ${exception ? "font-semibold text-blue-700" : "text-slate-600"}`}>{formatHours(exception?.availableMinutes ?? defaultMinutes)}</span>
              {exception?.note && <span className="block text-xs text-slate-500">メモあり</span>}
            </button>
          );
        })}
      </div>

      {loading && <p className="mt-4 text-sm text-slate-600">読み込み中...</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-green-700">{message}</p>}

      {selectedDate && !loading && (
        <section className="mt-6 rounded border bg-white p-4 shadow-sm" aria-label="作業時間の編集">
          <h3 className="font-semibold">{selectedDate} の作業可能時間</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setHours("0")} className="rounded border px-3 py-2 hover:bg-slate-50">休み 0h</button>
            <button type="button" onClick={() => setHours("4")} className="rounded border px-3 py-2 hover:bg-slate-50">半日 4h</button>
            <button type="button" onClick={() => setHours("8")} className="rounded border px-3 py-2 hover:bg-slate-50">通常 8h</button>
          </div>
          <label className="mt-4 block text-sm font-medium" htmlFor="work-hours">作業可能時間（0〜24時間）</label>
          <input id="work-hours" type="number" min="0" max="24" step="any" value={hours} onChange={event => setHours(event.target.value)} className="mt-1 w-32 rounded border px-3 py-2" />
          <label className="mt-4 block text-sm font-medium" htmlFor="work-note">メモ（200文字以内）</label>
          <textarea id="work-note" maxLength={200} value={note} onChange={event => setNote(event.target.value)} rows={3} className="mt-1 block w-full rounded border px-3 py-2" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
            <button type="button" onClick={() => { setHours("8"); setNote(""); setMessage(""); }} disabled={saving} className="rounded border px-4 py-2 hover:bg-slate-50 disabled:opacity-50">通常8hに戻す（メモ削除）</button>
            <span className="text-xs text-slate-500">「通常8hに戻す」を選んだ後、保存すると例外登録が削除されます。</span>
          </div>
        </section>
      )}
    </div>
  );
}
