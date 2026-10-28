"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = { id: number; repairId: number; inquiryNumber: string; snippet: string; createdAt: string };
type Feed = { unreadCount: number; latestId: number; recent: Item[] };
type Volume = "small" | "medium" | "loud";
const LAST_NOTIFIED = "customer-comment-last-notified-id";
const SOUND = "customer-comment-sound";
const VOLUME = "customer-comment-volume";
const link = (item: Item) => `/repairs/${item.repairId}/comments#message-${item.id}`;

export function CustomerCommentNotifications() {
  const [feed, setFeed] = useState<Feed>({ unreadCount: 0, latestId: 0, recent: [] });
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Item | null>(null);
  const [sound, setSound] = useState(true);
  const [volume, setVolume] = useState<Volume>("medium");
  const baseline = useRef<number | null>(null);
  const busy = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const unlocked = useRef(false);

  const chime = useCallback(() => {
    if (!sound || !unlocked.current) return;
    try {
      const context = audio.current;
      if (!context || context.state !== "running") return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.setValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(({ small: 0.025, medium: 0.06, loud: 0.12 } as const)[volume], now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now); oscillator.stop(now + 0.29);
    } catch { /* Audio is optional. */ }
  }, [sound, volume]);

  const poll = useCallback(async () => {
    if (busy.current || document.visibilityState === "hidden") return;
    busy.current = true;
    try {
      const response = await fetch("/api/notifications/customer-comments", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as Feed;
      if (!Number.isSafeInteger(data.latestId) || !Array.isArray(data.recent)) return;
      setFeed(data);
      if (baseline.current === null) {
        baseline.current = data.latestId;
        return;
      }
      const previous = baseline.current;
      baseline.current = Math.max(baseline.current, data.latestId);
      if (data.latestId <= previous) return;
      const announce = () => {
        let shared = 0;
        try { shared = Number(localStorage.getItem(LAST_NOTIFIED) || 0); } catch {}
        const newest = data.recent.find((item) => item.id > Math.max(previous, shared));
        if (!newest) return;
        try { localStorage.setItem(LAST_NOTIFIED, String(newest.id)); } catch {}
        setToast(newest);
        chime();
      };
      if (navigator.locks) await navigator.locks.request(LAST_NOTIFIED, announce);
      else announce();
    } catch { /* Polling fails quietly and retries later. */ }
    finally { busy.current = false; }
  }, [chime]);

  useEffect(() => {
    try {
      setSound(localStorage.getItem(SOUND) !== "off");
      const saved = localStorage.getItem(VOLUME);
      if (saved === "small" || saved === "medium" || saved === "loud") setVolume(saved);
    } catch { /* Private browsing can deny storage. */ }
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().then(() => { unlocked.current = true; }).catch(() => {});
      } catch { /* Audio is optional. */ }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      void audio.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), 15000);
    const resume = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [poll]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  return <div className="relative shrink-0">
    <button type="button" aria-label={`通知 ${feed.unreadCount} 件未読`} aria-expanded={open} onClick={() => setOpen((value) => !value)}
      className="relative rounded p-2 text-gray-200 hover:bg-gray-800"><Bell size={18} />
      {feed.unreadCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-blue-600 px-1 text-[10px] text-white">{feed.unreadCount > 99 ? "99+" : feed.unreadCount}</span>}
    </button>
    {open && <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-1rem))] rounded border bg-white p-3 text-gray-900 shadow-xl">
      <div className="mb-2 flex items-center justify-between"><strong>未読コメント ({feed.unreadCount})</strong><button type="button" onClick={() => setOpen(false)} aria-label="閉じる">×</button></div>
      <div className="max-h-80 overflow-y-auto text-sm">{feed.recent.length === 0 ? <p className="text-gray-500">未読コメントはありません。</p> : feed.recent.map((item) =>
        <Link key={item.id} href={link(item)} onClick={() => setOpen(false)} className="block border-t px-1 py-2 hover:bg-blue-50">
          <span className="font-medium">{item.inquiryNumber}</span><span className="ml-2 text-xs text-gray-500">{new Date(item.createdAt).toLocaleString("ja-JP")}</span>
          <span className="block truncate text-gray-600">{item.snippet}</span>
        </Link>)}
      </div>
      {feed.unreadCount > feed.recent.length && <p className="mt-1 text-xs text-gray-500">最新20件を表示しています。</p>}
      <div className="mt-2 flex items-center gap-2 border-t pt-2 text-xs">
        <label><input type="checkbox" checked={sound} onChange={(event) => { setSound(event.target.checked); try { localStorage.setItem(SOUND, event.target.checked ? "on" : "off"); } catch {} }} /> 音</label>
        <select aria-label="通知音量" value={volume} onChange={(event) => { const value = event.target.value as Volume; setVolume(value); try { localStorage.setItem(VOLUME, value); } catch {} }} className="rounded border px-1 py-1">
          <option value="small">小</option><option value="medium">中</option><option value="loud">大</option>
        </select>
      </div>
    </div>}
    {toast && <Link href={link(toast)} onClick={() => setToast(null)} role="status" className="fixed right-4 top-16 z-50 max-w-xs rounded border border-blue-200 bg-white p-3 text-sm text-gray-900 shadow-lg">
      <strong>新しいお客様コメント・{toast.inquiryNumber}</strong><span className="mt-1 block truncate">{toast.snippet}</span>
    </Link>}
  </div>;
}
