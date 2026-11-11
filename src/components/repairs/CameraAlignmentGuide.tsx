"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { containedImageRect } from "@/lib/camera-alignment";

type Mode = "FRONT" | "BACK" | "WHOLE" | "PARTS" | "OFF";
type Settings = { mode: Mode; size: number; visible: boolean };
const STORAGE_KEY = "camera-alignment-guide-v1";
const DEFAULT: Settings = { mode: "FRONT", size: 70, visible: true };
const MODES: { value: Mode; label: string }[] = [
  { value: "FRONT", label: "正面" }, { value: "BACK", label: "裏面" },
  { value: "WHOLE", label: "時計全体" }, { value: "PARTS", label: "部品" },
  { value: "OFF", label: "なし" },
];

function readSettings(): Settings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return {
      mode: MODES.some((item) => item.value === saved?.mode) ? saved.mode : DEFAULT.mode,
      size: Number.isInteger(saved?.size) && saved.size >= 45 && saved.size <= 85 && saved.size % 5 === 0 ? saved.size : DEFAULT.size,
      visible: typeof saved?.visible === "boolean" ? saved.visible : DEFAULT.visible,
    };
  } catch { return DEFAULT; }
}

export function CameraAlignmentGuide({ children, className = "" }: { children: ReactNode; className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [image, setImage] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const sync = () => setSettings(readSettings());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(STORAGE_KEY, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(STORAGE_KEY, sync); };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const video = frame?.querySelector("video");
    if (!frame || !video) return;
    const measure = () => {
      const box = video.getBoundingClientRect();
      const parent = frame.getBoundingClientRect();
      if (!video.videoWidth || !video.videoHeight || !box.width || !box.height) return;
      const rect = containedImageRect(box.width, box.height, video.videoWidth, video.videoHeight);
      setImage({ left: box.left - parent.left + rect.left, top: box.top - parent.top + rect.top, width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(video);
    video.addEventListener("loadedmetadata", measure);
    measure();
    return () => { observer.disconnect(); video.removeEventListener("loadedmetadata", measure); };
  }, [children]);

  const update = (next: Settings) => {
    setSettings(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); window.dispatchEvent(new Event(STORAGE_KEY)); } catch { /* storage may be unavailable */ }
  };
  const { mode, size, visible } = settings;
  const side = Math.min(image.width, image.height) * 0.9;
  const cx = image.width / 2;
  const cy = image.height / 2;
  const line = "rgba(255,255,255,.32)";
  const cyan = "rgba(80,220,240,.75)";

  return <>
    <div ref={frameRef} className={`relative ${className}`}>
      {children}
      {visible && mode !== "OFF" && image.width > 0 && <svg aria-hidden="true" className="pointer-events-none absolute" style={{ left: image.left, top: image.top, width: image.width, height: image.height }} viewBox={`0 0 ${image.width} ${image.height}`}>
        {mode === "WHOLE" ? <>
          <line x1={cx} y1={cy - side / 2} x2={cx} y2={cy + side / 2} stroke={line} strokeDasharray="5 7" />
          <rect x={cx - side * .28} y={cy - side / 2} width={side * .56} height={side} rx={side * .25} fill="none" stroke={cyan} strokeWidth="1.5" />
        </> : <>
          {mode !== "PARTS" && <>
            <rect x={cx - side / 2} y={cy - side / 2} width={side} height={side} fill="none" stroke={line} strokeWidth="1" strokeDasharray="5 7" />
            <line x1={cx - side / 2} y1={cy} x2={cx + side / 2} y2={cy} stroke={line} strokeWidth="1" />
            <line x1={cx} y1={cy - side / 2} x2={cx} y2={cy + side / 2} stroke={line} strokeWidth="1" />
            <circle cx={cx} cy={cy} r={side * size / 200} fill="none" stroke={cyan} strokeWidth="1.5" />
          </>}
          <circle cx={cx} cy={cy} r="2.5" fill={cyan} />
        </>}
      </svg>}
    </div>
    <div className="flex flex-wrap items-center gap-2 bg-zinc-900 px-2 py-2 text-xs text-white">
      <label className="flex items-center gap-1">ガイド
        <select aria-label="撮影ガイド" className="rounded border border-zinc-500 bg-zinc-800 px-2 py-1" value={mode} onChange={(event) => update({ ...settings, mode: event.target.value as Mode })}>
          {MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <button type="button" className="rounded border border-zinc-500 px-2 py-1" aria-pressed={visible} onClick={() => update({ ...settings, visible: !visible })}>{visible ? "ガイドを隠す" : "ガイドを表示"}</button>
      {(mode === "FRONT" || mode === "BACK") && <label className="flex items-center gap-1">ガイドサイズ
        <input aria-label="ガイドサイズ" type="range" min="45" max="85" step="5" value={size} onChange={(event) => update({ ...settings, size: Number(event.target.value) })} />
        <span className="min-w-8">{size}%</span>
      </label>}
    </div>
  </>;
}
