"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parsePhysicalTagIdentifier, PhysicalTagIdentifierError } from "@/lib/physical-tag-resolver";

type Preflight = { status: "AVAILABLE" | "REUSABLE" | "ASSIGNED" | "RETIRED";
  physicalTagId?: number; shortCode?: string };

export function PhysicalTagNfcBinding({ physicalTagId, repairId, shortCode, inquiryNumber, initialNfcUid, onBound, onReused, disabled, onActivityChange }: {
  physicalTagId: number; repairId: number; shortCode: string; inquiryNumber: string;
  initialNfcUid: string | null; onBound?: (uid: string) => void;
  onReused?: (result: { physicalTagId: number; shortCode: string; nfcUid: string }) => void;
  disabled?: boolean; onActivityChange?: (active: boolean) => void;
}) {
  const [nfcUid, setNfcUid] = useState(initialNfcUid);
  const [reading, setReading] = useState(false);
  const [raw, setRaw] = useState("");
  const [candidate, setCandidate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const savingRef = useRef(false);
  const readVersion = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNfcUid(initialNfcUid); }, [initialNfcUid]);
  useEffect(() => { if (reading && !candidate) inputRef.current?.focus(); }, [reading, candidate]);

  async function stage() {
    const version = ++readVersion.current;
    try {
      const uid = parsePhysicalTagIdentifier({ type: "NFC_UID", value: raw }).value;
      setCandidate(null); setPreflight(null);
      if (onReused) {
        setSaving(true);
        const response = await fetch("/api/physical-tags/b2b-nfc-reuse", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ physicalTagId, repairId, nfcUid: uid }),
        });
        const result = await response.json();
        if (version !== readVersion.current) return;
        if (!response.ok) throw new Error(result.error || "NFC UIDを確認できませんでした。");
        if (!["AVAILABLE", "REUSABLE", "ASSIGNED", "RETIRED"].includes(result.status) ||
            (result.status === "REUSABLE" && (!Number.isSafeInteger(result.physicalTagId) ||
              typeof result.shortCode !== "string")))
          throw new Error("NFC UIDの確認結果が不正です。再読込してください。");
        setPreflight(result);
      }
      setCandidate(uid);
      setError("");
    } catch (cause) {
      if (version !== readVersion.current) return;
      if (cause instanceof PhysicalTagIdentifierError) setError("NFC UIDが不正です。もう一度読み取ってください。");
      else setError(cause instanceof Error ? cause.message : "NFC UIDを確認できませんでした。");
      setCandidate(null);
    } finally {
      if (version === readVersion.current) setSaving(false);
    }
  }

  function cancel() {
    if (savingRef.current) return;
    readVersion.current++;
    onActivityChange?.(false);
    setReading(false); setRaw(""); setCandidate(null); setPreflight(null); setError("");
  }

  async function confirm() {
    if (!candidate || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const reuse = preflight?.status === "REUSABLE";
      const response = await fetch(reuse ? "/api/physical-tags/b2b-nfc-reuse" : "/api/physical-tags/bind-nfc", {
        method: reuse ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ physicalTagId, repairId, nfcUid: candidate,
          ...(reuse ? { reusableTagId: preflight.physicalTagId, confirmed: true } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "NFC UIDを登録できませんでした。");
      if (result.physicalTagId !== (reuse ? preflight.physicalTagId : physicalTagId) ||
          result.repairId !== repairId || result.nfcUid !== candidate ||
          (reuse && (result.retiredPhysicalTagId !== physicalTagId || result.shortCode !== preflight.shortCode)))
        throw new Error("登録結果を確認できません。案件を再読込して確認してください。");
      if (reuse) {
        onReused?.({ physicalTagId: result.physicalTagId, shortCode: result.shortCode, nfcUid: result.nfcUid });
        onActivityChange?.(false);
        setReading(false); setCandidate(null); setPreflight(null);
        return;
      }
      setNfcUid(result.nfcUid);
      onActivityChange?.(false);
      setReading(false); setRaw(""); setCandidate(null); setPreflight(null);
      onBound?.(result.nfcUid);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "NFC UIDを登録できませんでした。");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (nfcUid !== null) return <span className="text-zinc-600">NFC UID: {nfcUid}</span>;
  return <div className="space-y-2 text-sm">
    <span className="text-zinc-600">NFC未登録</span>
    {!reading ? <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => { onActivityChange?.(true); setReading(true); setError(""); }}>
      NFCタグを登録
    </Button> : <div className="space-y-2 rounded border border-zinc-300 p-2">
      <form onSubmit={event => { event.preventDefault(); void stage(); }} className="flex flex-wrap items-end gap-2">
        <label>R65でNFCタグを読み取ってください
          <input ref={inputRef} value={raw} autoComplete="off" className="mt-1 block w-64 rounded border px-2 py-1 font-mono"
            onChange={event => { readVersion.current++; setRaw(event.target.value); setCandidate(null); setPreflight(null); setError(""); }} />
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={saving}>候補を確認</Button>
      </form>
      {candidate && <p role="status">読取候補: <span className="font-mono">{candidate}</span>（まだ保存していません）</p>}
      {candidate && preflight?.status === "REUSABLE" && <p role="status">{preflight.shortCode} は未割当で再利用できます。確認すると現在の {shortCode} は退役します。印刷済みの旧QRラベルは使用せず、新しいQRラベルを印刷してください。</p>}
      {candidate && preflight?.status === "ASSIGNED" && <p role="alert">このNFCタグは別の案件に割当中です。登録できません。</p>}
      {candidate && preflight?.status === "RETIRED" && <p role="alert">このNFCタグは退役済みです。登録できません。</p>}
      {candidate && (preflight === null || preflight.status === "AVAILABLE" || preflight.status === "REUSABLE") &&
        <Button type="button" size="sm" disabled={saving} onClick={() => void confirm()}>
          {saving ? "登録中..." : preflight?.status === "REUSABLE" ?
            `${preflight.shortCode} を${inquiryNumber}へ再割当し、QR再印刷を確認` :
            `このUIDを${inquiryNumber} / ${shortCode}へ登録`}
        </Button>}
      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={cancel}>キャンセル</Button>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
