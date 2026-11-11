"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { TagDocument } from "@/components/pdf/TagDocument";
import { physicalTagLabel } from "@/lib/physical-tag-label";
import { printPhysicalTagLabel } from "@/lib/bpac-physical-tag-print";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhysicalTagNfcBinding } from "./PhysicalTagNfcBinding";

type Tag = { physicalTagId: number; shortCode: string; qrToken: string; nfcUid: string | null };
type Preflight = { status: "AVAILABLE" | "REUSABLE" | "ASSIGNED" | "RETIRED" | "UNAVAILABLE";
  physicalTagId?: number; shortCode?: string };
type Props = {
  repairId: number;
  inquiryNumber: string;
  customerType: "individual" | "business";
  customerName: string;
  companyName: string | null;
  endUserName: string | null;
  partnerRef: string | null;
  brand: string;
  model: string;
  reference: string;
  caseReference: string;
  serialNumber: string | null;
  movementCaliber: string | null;
  watchCaliber: string | null;
  receptionDate: string | null;
  initialTag: Tag | null;
};

export function PhysicalTagPanel(props: Props) {
  const router = useRouter();
  const [tag, setTag] = useState<Tag | null>(props.initialTag);
  const [nfcUid, setNfcUid] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [candidate, setCandidate] = useState("");
  const inputVersion = useRef(0);
  const [printing, setPrinting] = useState(false);
  const printingRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => { setTag(props.initialTag); }, [props.initialTag]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function buildLabel(activeTag: Tag) {
    return physicalTagLabel({
      shortCode: activeTag.shortCode, qrToken: activeTag.qrToken,
      inquiryNumber: props.inquiryNumber, customerType: props.customerType,
      customerName: props.customerName, companyName: props.companyName,
      endUserName: props.endUserName, partnerRef: props.partnerRef,
      brand: props.brand, model: props.model, reference: props.reference, caseReference: props.caseReference,
      serialNumber: props.serialNumber,
      movementCaliber: props.movementCaliber, watchCaliber: props.watchCaliber,
      receptionDate: props.receptionDate,
    });
  }

  async function issue() {
    setIssuing(true);
    setError("");
    setNotice("");
    try {
      const uid = nfcUid.trim();
      if (uid && (!preflight || candidate !== uid ||
          preflight.status === "ASSIGNED" || preflight.status === "RETIRED" || preflight.status === "UNAVAILABLE")) {
        const version = inputVersion.current;
        const response = await fetch("/api/physical-tags/issue", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repairId: props.repairId, nfcUid: uid }),
        });
        const result = await response.json();
        if (version !== inputVersion.current) return;
        if (!response.ok) throw new Error(result.error || "NFC UIDを確認できませんでした。");
        if (!["AVAILABLE", "REUSABLE", "ASSIGNED", "RETIRED", "UNAVAILABLE"].includes(result.status) ||
            (result.status === "REUSABLE" && (!Number.isSafeInteger(result.physicalTagId) ||
              typeof result.shortCode !== "string")))
          throw new Error("NFC UIDの確認結果が不正です。再確認してください。");
        setPreflight(result); setCandidate(uid);
        return;
      }
      if (uid && (preflight?.status === "ASSIGNED" || preflight?.status === "RETIRED" || preflight?.status === "UNAVAILABLE")) return;
      const response = await fetch("/api/physical-tags/issue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repairId: props.repairId, ...(uid ? { nfcUid: uid } : {}),
          ...(uid && preflight?.status === "REUSABLE"
            ? { reusableTagId: preflight.physicalTagId, confirmed: true } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "管理タグを発行できませんでした。");
      setTag({ physicalTagId: result.physicalTagId, shortCode: result.shortCode,
        qrToken: result.qrToken, nfcUid: result.nfcUid });
      setPreflight(null);
      if (uid && preflight?.status === "REUSABLE")
        setNotice(`${result.shortCode} を再割当しました。古いラベルは使わず、この案件のラベルを再印刷してください。`);
      router.refresh();
    } catch (cause) {
      setPreflight(null);
      setCandidate("");
      setError(cause instanceof Error ? cause.message : "管理タグを発行できませんでした。");
    } finally {
      setIssuing(false);
    }
  }

  async function directPrint() {
    if (!tag || printingRef.current) return;
    printingRef.current = true;
    setPrinting(true);
    setError("");
    setNotice("");
    try {
      await printPhysicalTagLabel(buildLabel(tag));
      setNotice(`${tag.shortCode} をBrother QL-800へ1枚印刷しました。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "管理タグラベルを印刷できませんでした。");
    } finally {
      printingRef.current = false;
      setPrinting(false);
    }
  }

  async function openPreview() {
    if (!tag) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setError("");
    setPreviewUrl(null);
    try {
      const label = buildLabel(tag);
      const qrCodeDataUrl = await QRCode.toDataURL(label.qrPayload, { width: 480, margin: 4 });
      const blob = await pdf(<TagDocument label={label} qrCodeDataUrl={qrCodeDataUrl} />).toBlob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError("ラベルPDFを生成できませんでした。");
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <section className="border-b border-zinc-200 bg-white px-4 py-3">
      <div className="mx-auto max-w-7xl space-y-2">
        <h2 className="text-sm font-semibold">PhysicalTag / 管理タグ</h2>
        {tag ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono font-semibold">{tag.shortCode}</span>
            <PhysicalTagNfcBinding key={tag.physicalTagId} physicalTagId={tag.physicalTagId}
              repairId={props.repairId} shortCode={tag.shortCode} inquiryNumber={props.inquiryNumber}
              initialNfcUid={tag.nfcUid} onBound={uid => setTag(current => current ? { ...current, nfcUid: uid } : current)} />
            <Button type="button" size="sm" disabled={printing} onClick={() => void directPrint()}>
              {printing ? "印刷中..." : "ラベル印刷"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={printing} onClick={() => void openPreview()}>
              プレビュー
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-zinc-600">
              NFC UID（任意・未入力ならQRのみ発行）
              <input className="mt-1 block w-64 rounded border px-2 py-1 text-sm" value={nfcUid}
                disabled={issuing} onChange={event => { inputVersion.current++; setNfcUid(event.target.value); setPreflight(null);
                  setCandidate(""); setError(""); }} placeholder="例: 04:33:3F:45:3B:02:89" />
            </label>
            <Button type="button" size="sm" disabled={issuing} onClick={() => void issue()}>
              {issuing ? "確認中..." : preflight?.status === "REUSABLE" ?
                `${preflight.shortCode} を${props.inquiryNumber}へ再割当する` :
                preflight?.status === "AVAILABLE" ? "新しい管理タグを発行" :
                preflight ? "NFC UIDを再確認" :
                nfcUid.trim() ? "NFC UIDを確認" : "QRのみで管理タグを発行"}
            </Button>
            {preflight?.status === "AVAILABLE" && <p role="status" className="w-full text-xs">このUIDは未登録です。新しい管理タグを発行できます。</p>}
            {preflight?.status === "REUSABLE" && <p role="status" className="w-full text-xs text-amber-800">{preflight.shortCode} は未割当で再利用できます。確認するとこの案件へ割り当てます。古いラベルは使わず、この案件のラベルを再印刷してください。</p>}
            {preflight?.status === "ASSIGNED" && <p role="alert" className="w-full text-xs text-red-700">このNFCタグは別の案件に割当中です。</p>}
            {preflight?.status === "RETIRED" && <p role="alert" className="w-full text-xs text-red-700">このNFCタグは退役済みです。</p>}
            {preflight?.status === "UNAVAILABLE" && <p role="alert" className="w-full text-xs text-red-700">このNFCタグは割当履歴がないため、再発行できません。</p>}
            <p className="w-full text-xs text-zinc-500">R65で読み取ったUIDは発行後にも登録できます。</p>
          </div>
        )}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>管理タグ ラベルプレビュー</DialogTitle></DialogHeader>
          <p className="text-xs text-zinc-500">Brother QL-800 / DK-2205 連続テープ用 62 × 75 mm PDF。印刷時は等倍・余白なしで用紙サイズを確認してください。</p>
          {previewLoading && <p>PDFを生成中...</p>}
          {error && !previewLoading && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {previewUrl && !previewLoading && <>
            <iframe src={previewUrl} title="管理タグPDF" className="h-80 w-full border" />
            <Button type="button" onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}>
              PDFを開いて印刷
            </Button>
          </>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
