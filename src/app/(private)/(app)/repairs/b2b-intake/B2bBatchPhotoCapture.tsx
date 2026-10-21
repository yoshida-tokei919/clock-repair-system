"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MobileConnectDialog } from "@/components/repairs/MobileConnectDialog";

type Repair = { id: number; inquiryNumber: string };

export function B2bBatchPhotoCapture({ repairs }: { repairs: Repair[] }) {
  const [selected, setSelected] = useState<Repair | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState("");
  const [resolution, setResolution] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [photoCounts, setPhotoCounts] = useState<Record<number, number>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRun = useRef(0);
  const knownCounts = useRef<Record<number, number>>({});

  const refreshPhotos = useCallback(async (repairId: number) => {
    try {
      const response = await fetch(`/api/repairs/${repairId}/photos`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const photos: unknown = await response.json();
      if (!Array.isArray(photos)) throw new Error();
      if (knownCounts.current[repairId] !== undefined && photos.length > knownCounts.current[repairId]) {
        setMessage(`Repair ID ${repairId} に写真が追加されました。`);
      }
      knownCounts.current[repairId] = photos.length;
      setPhotoCounts(current => ({ ...current, [repairId]: photos.length }));
    } catch { setError(`ID ${repairId} の写真枚数を取得できませんでした。案件画面で確認してください。`); }
  }, []);

  useEffect(() => {
    for (const repair of repairs) void refreshPhotos(repair.id);
  }, [repairs, refreshPhotos]);

  function stopCamera() {
    cameraRun.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
    setCameraOpen(false);
    setPreview("");
    setResolution("");
  }

  useEffect(() => () => {
    cameraRun.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  async function openCamera(repair: Repair) {
    stopCamera();
    setSelected(repair);
    setError("");
    setMessage("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("PCカメラは HTTPS または localhost の対応ブラウザで利用してください。");
      return;
    }
    setCameraOpen(true);
    const run = cameraRun.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 }, aspectRatio: { ideal: 16 / 9 } },
        audio: false,
      });
      if (run !== cameraRun.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (run !== cameraRun.current) return;
      if (!videoRef.current) { stopCamera(); return; }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (run !== cameraRun.current) return;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      setResolution(`入力: ${settings?.width ?? "?"} × ${settings?.height ?? "?"} px（希望: 3840 × 2160）`);
      setReady(true);
    } catch {
      stopCamera();
      setError("カメラを起動できませんでした。接続とブラウザの権限を確認してください。");
    }
  }

  function capture() {
    if (!selected || !ready || saving || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) { setError("映像の解像度を取得できませんでした。"); return; }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) { setError("撮影画像を生成できませんでした。"); return; }
    context.drawImage(video, 0, 0);
    const image = canvas.toDataURL("image/jpeg", 0.92);
    const details = `${resolution} / 保存: ${canvas.width} × ${canvas.height} px（JPEG 92%）`;
    stopCamera();
    setCameraOpen(true);
    setPreview(image);
    setResolution(details);
    setError("");
  }

  async function upload() {
    if (!selected || !preview || !canvasRef.current || saving) return;
    const repairId = selected.id;
    setSaving(true);
    setError("");
    try {
      const blob = await new Promise<Blob | null>(resolve => canvasRef.current?.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("撮影画像を生成できませんでした。");
      const data = new FormData();
      data.append("file", new File([blob], `b2b-${repairId}-${Date.now()}.jpg`, { type: "image/jpeg" }));
      data.append("repairId", String(repairId));
      data.append("category", "FRONT");
      data.append("stage", "RECEPTION");
      const response = await fetch("/api/upload", { method: "POST", body: data });
      const body = await response.json();
      if (!response.ok || !body.success || body.photo?.repairId !== repairId) throw new Error(body.error || "保存結果を確認できません。案件画面で確認してください。");
      stopCamera();
      setMessage(`${selected.inquiryNumber} に写真を保存しました。`);
      await refreshPhotos(repairId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存結果を確認できません。案件画面で確認してください。");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mt-5 rounded-md border border-green-300 bg-white p-4 text-sm">
    <h3 className="font-semibold">受付写真</h3>
    <p className="mt-1">案件IDは一括登録後に確定します。登録済みの案件ごとにPCカメラまたはスマホQRで撮影してください。</p>
    <ul className="mt-3 space-y-2">{repairs.map(repair => <li key={repair.id} className="flex flex-wrap items-center gap-2">
      <span className="min-w-36">{repair.inquiryNumber}（ID: {repair.id}）：{photoCounts[repair.id] ?? "—"}枚</span>
      <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={saving}
        onClick={() => void openCamera(repair)}>PCで撮影</button>
      <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={saving}
        onClick={() => { stopCamera(); setSelected(repair); setError(""); setMessage(""); setMobileOpen(true); }}>スマホQRで撮影</button>
    </li>)}</ul>
    {cameraOpen && selected && <div className="mt-4 rounded border p-3">
      <p className="font-medium">撮影・保存先: {selected.inquiryNumber}（ID: {selected.id}）</p>
      {!preview && <video ref={videoRef} autoPlay playsInline muted className="mt-2 max-h-96 w-full bg-black object-contain" />}
      {preview && <img src={preview} alt={`${selected.inquiryNumber}の撮影プレビュー`} className="mt-2 max-h-96 w-full bg-black object-contain" />}
      <canvas ref={canvasRef} className="hidden" />
      {resolution && <p className="mt-2 text-xs text-zinc-600">{resolution}</p>}
      <div className="mt-2 flex gap-2">
        {!preview && <button type="button" className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={!ready || saving} onClick={capture}>撮影</button>}
        {preview && <>
          <button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={saving} onClick={() => void openCamera(selected)}>撮り直す</button>
          <button type="button" className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={saving} onClick={() => void upload()}>{saving ? "保存中..." : "この写真を確認して保存"}</button>
        </>}
        <button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={saving} onClick={stopCamera}>閉じる</button>
      </div>
    </div>}
    {message && <p role="status" className="mt-2 text-green-800">{message}</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {selected && <MobileConnectDialog isOpen={mobileOpen} repairId={String(selected.id)}
      onClose={() => { setMobileOpen(false); void refreshPhotos(selected.id); }} onPhotosUploaded={() => { void refreshPhotos(selected.id); }} />}
  </section>;
}
