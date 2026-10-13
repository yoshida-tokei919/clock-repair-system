"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parsePhysicalTagIdentifier, PhysicalTagIdentifierError } from "@/lib/physical-tag-resolver";

export function PhysicalTagNfcBinding({ physicalTagId, repairId, shortCode, inquiryNumber, initialNfcUid, onBound }: {
  physicalTagId: number; repairId: number; shortCode: string; inquiryNumber: string;
  initialNfcUid: string | null; onBound?: (uid: string) => void;
}) {
  const [nfcUid, setNfcUid] = useState(initialNfcUid);
  const [reading, setReading] = useState(false);
  const [raw, setRaw] = useState("");
  const [candidate, setCandidate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNfcUid(initialNfcUid); }, [initialNfcUid]);
  useEffect(() => { if (reading && !candidate) inputRef.current?.focus(); }, [reading, candidate]);

  function stage() {
    try {
      setCandidate(parsePhysicalTagIdentifier({ type: "NFC_UID", value: raw }).value);
      setError("");
    } catch (cause) {
      if (cause instanceof PhysicalTagIdentifierError) setError("NFC UIDが不正です。もう一度読み取ってください。");
      else setError("NFC UIDを確認できませんでした。");
      setCandidate(null);
    }
  }

  function cancel() {
    if (savingRef.current) return;
    setReading(false); setRaw(""); setCandidate(null); setError("");
  }

  async function confirm() {
    if (!candidate || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/physical-tags/bind-nfc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ physicalTagId, repairId, nfcUid: candidate }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "NFC UIDを登録できませんでした。");
      if (result.physicalTagId !== physicalTagId || result.repairId !== repairId || result.nfcUid !== candidate)
        throw new Error("登録結果を確認できません。案件を再読込して確認してください。");
      setNfcUid(result.nfcUid);
      setReading(false); setRaw(""); setCandidate(null);
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
    {!reading ? <Button type="button" variant="outline" size="sm" onClick={() => { setReading(true); setError(""); }}>
      NFCタグを登録
    </Button> : <div className="space-y-2 rounded border border-zinc-300 p-2">
      <form onSubmit={event => { event.preventDefault(); stage(); }} className="flex flex-wrap items-end gap-2">
        <label>R65でNFCタグを読み取ってください
          <input ref={inputRef} value={raw} autoComplete="off" className="mt-1 block w-64 rounded border px-2 py-1 font-mono"
            onChange={event => { setRaw(event.target.value); setCandidate(null); setError(""); }} />
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={saving}>候補を確認</Button>
      </form>
      {candidate && <p role="status">読取候補: <span className="font-mono">{candidate}</span>（まだ保存していません）</p>}
      {candidate && <Button type="button" size="sm" disabled={saving} onClick={() => void confirm()}>
        {saving ? "登録中..." : `このUIDを${inquiryNumber} / ${shortCode}へ登録`}
      </Button>}
      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={cancel}>キャンセル</Button>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
