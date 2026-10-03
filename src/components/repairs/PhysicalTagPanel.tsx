"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { TagDocument } from "@/components/pdf/TagDocument";
import { physicalTagLabel } from "@/lib/physical-tag-label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Tag = { physicalTagId: number; shortCode: string; qrToken: string; nfcUid: string | null };
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
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => { setTag(props.initialTag); }, [props.initialTag]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function issue() {
    setIssuing(true);
    setError("");
    try {
      const response = await fetch("/api/physical-tags/issue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repairId: props.repairId, ...(nfcUid.trim() ? { nfcUid: nfcUid.trim() } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "管理タグを発行できませんでした。");
      setTag({ physicalTagId: result.physicalTagId, shortCode: result.shortCode,
        qrToken: result.qrToken, nfcUid: result.nfcUid });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "管理タグを発行できませんでした。");
    } finally {
      setIssuing(false);
    }
  }

  async function openPreview() {
    if (!tag) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setError("");
    setPreviewUrl(null);
    try {
      const label = physicalTagLabel({
        shortCode: tag.shortCode, qrToken: tag.qrToken,
        inquiryNumber: props.inquiryNumber, customerType: props.customerType,
        customerName: props.customerName, companyName: props.companyName,
        endUserName: props.endUserName, partnerRef: props.partnerRef,
        brand: props.brand, model: props.model, reference: props.reference,
        serialNumber: props.serialNumber,
        movementCaliber: props.movementCaliber, watchCaliber: props.watchCaliber,
        receptionDate: props.receptionDate,
      });
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
            {tag.nfcUid && <span className="text-zinc-600">NFC UID: {tag.nfcUid}</span>}
            <Button type="button" variant="outline" size="sm" onClick={() => void openPreview()}>
              ラベルをプレビュー・印刷
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-zinc-600">
              NFC UID（任意・未入力ならQRのみ発行）
              <input className="mt-1 block w-64 rounded border px-2 py-1 text-sm" value={nfcUid}
                onChange={event => setNfcUid(event.target.value)} placeholder="例: 04:33:3F:45:3B:02:89" />
            </label>
            <Button type="button" size="sm" disabled={issuing} onClick={() => void issue()}>
              {issuing ? "発行中..." : "管理タグを発行"}
            </Button>
            <p className="w-full text-xs text-zinc-500">R65リーダーのUID出力形式は未確認です。UIDは後から確認できます。</p>
          </div>
        )}
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
