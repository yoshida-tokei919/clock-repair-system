"use client";

import { useEffect, useRef, useState } from "react";

export type CapturedPhoto = {
  key: string; rowKey: number; file: File; url: string;
  status: "pending" | "uploading" | "success" | "failed" | "unknown";
  error?: string;
};

export function B2bPreIntakeCamera({ rowKey, watchNumber, photos, disabled, onAdd, onDelete }: {
  rowKey: number; watchNumber: number; photos: CapturedPhoto[]; disabled: boolean;
  onAdd: (photo: CapturedPhoto) => void; onDelete: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<{ file: File; url: string } | null>(null);
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const draftRef = useRef<{ file: File; url: string } | null>(null);

  function stop() {
    runRef.current++;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }
  function clearDraft() {
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
    draftRef.current = null;
    setDraft(null);
  }
  useEffect(() => {
    if (disabled) { stop(); clearDraft(); setOpen(false); }
  }, [disabled]);
  useEffect(() => () => {
    runRef.current++;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
  }, []);

  async function start() {
    if (disabled) return;
    stop();
    clearDraft();
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("PCカメラは HTTPS または localhost の対応ブラウザで利用してください。");
      return;
    }
    setOpen(true);
    const run = runRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 }, aspectRatio: { ideal: 16 / 9 } },
        audio: false,
      });
      if (run !== runRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (run !== runRef.current) return;
      if (!videoRef.current) { stop(); return; }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (run !== runRef.current) return;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      setResolution(`入力: ${settings?.width ?? "?"} × ${settings?.height ?? "?"} px（希望: 3840 × 2160）`);
      setReady(true);
    } catch {
      if (run === runRef.current) { stop(); setError("カメラを起動できませんでした。接続とブラウザの権限を確認してください。"); }
    }
  }

  async function capture() {
    if (disabled) return;
    const video = videoRef.current;
    if (!ready || !video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) { setError("撮影画像を生成できませんでした。"); return; }
    context.drawImage(video, 0, 0);
    stop();
    const run = runRef.current;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (run !== runRef.current) return;
    if (!blob) { setError("撮影画像を生成できませんでした。"); return; }
    const file = new File([blob], `b2b-pre-${rowKey}-${Date.now()}.jpg`, { type: "image/jpeg" });
    const next = { file, url: URL.createObjectURL(file) };
    draftRef.current = next;
    setDraft(next);
    setResolution(`${resolution} / 撮影: ${canvas.width} × ${canvas.height} px（JPEG 92%）`);
  }

  function confirm() {
    if (disabled) return;
    if (!draftRef.current) return;
    const saved = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    onAdd({ key: crypto.randomUUID(), rowKey, ...saved, status: "pending" });
    setOpen(false);
  }

  function close() { stop(); clearDraft(); setOpen(false); }

  return <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={disabled} onClick={() => void start()}>Webカメラで外観を撮影</button>
      <span>時計 {watchNumber}：{photos.length}枚（撮影なしでも登録可）</span>
    </div>
    {open && <div className="mt-3 rounded border bg-white p-3">
      <p className="text-lg font-bold text-blue-900">撮影対象：時計 {watchNumber}</p>
      {!draft && <video ref={videoRef} autoPlay playsInline muted className="mt-2 max-h-96 w-full bg-black object-contain" />}
      {draft && <img src={draft.url} alt={`時計 ${watchNumber} の確認画像`} className="mt-2 max-h-96 w-full bg-black object-contain" />}
      {resolution && <p className="mt-2 text-xs">{resolution}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {!draft && <button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={!ready} onClick={() => void capture()}>撮影</button>}
        {draft && <><button type="button" className="rounded border px-3 py-2" onClick={() => void start()}>撮り直す</button>
          <button type="button" className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={disabled} onClick={confirm}>この写真を確定</button></>}
        <button type="button" className="rounded border px-3 py-2" onClick={close}>閉じる</button>
      </div>
    </div>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {photos.length > 0 && <div className="mt-3 flex flex-wrap gap-3">{photos.map((photo) =>
      <div key={photo.key} className="w-32"><img src={photo.url} alt={`時計 ${watchNumber} の撮影写真`} className="h-24 w-32 rounded object-cover" />
        <button type="button" className="mt-1 text-red-700 disabled:opacity-40" disabled={disabled} onClick={() => onDelete(photo.key)}>削除</button></div>)}</div>}
  </div>;
}
