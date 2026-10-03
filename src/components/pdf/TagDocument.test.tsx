import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { isValidElement, type ReactNode } from "react";
import { Font, Image, Page, Text, pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { TagDocument, TAG_PAGE_SIZE, TAG_QR_SIZE } from "./TagDocument";
import type { PhysicalTagLabel } from "@/lib/physical-tag-label";

const label: PhysicalTagLabel = {
  shortCode: "PT-000123", inquiryNumber: "T-999", customerType: "business",
  customerName: "取引先会社", endUserName: "所有者", partnerRef: "先方-001",
  brand: "ロレックス", model: "デイトジャスト", reference: "16233",
  serialNumber: "SN123", caliber: "3135", receptionDate: "2026/10/3",
  qrPayload: "opaque_token_123",
};

function elements(node: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const item = node as React.ReactElement<Record<string, unknown>>;
  return [item, ...elements(item.props.children as ReactNode)];
}

test("PhysicalTag PDF uses 62 × 75 mm and keeps a 28 mm QR with every fixed field", () => {
  const nodes = elements(TagDocument({ label, qrCodeDataUrl: "data:image/png;base64,AA==" }));
  const page = nodes.find(node => node.type === Page);
  assert.deepEqual(page?.props.size, TAG_PAGE_SIZE);
  assert.ok(Math.abs(TAG_PAGE_SIZE[0] - 62 * 72 / 25.4) < 0.001);
  assert.ok(Math.abs(TAG_PAGE_SIZE[1] - 75 * 72 / 25.4) < 0.001);
  const qr = nodes.find(node => node.type === Image);
  assert.deepEqual(qr?.props.style, { width: TAG_QR_SIZE, height: TAG_QR_SIZE });
  const printed = nodes.filter(node => node.type === Text).map(node =>
    elementsText(node.props.children as ReactNode)).join(" ");
  assert.ok(nodes.filter(node => node.type === Text).every(node => node.props.wrap === false));
  for (const value of ["T-999", "先方-001", "取引先会社", "所有者", "ロレックス",
    "デイトジャスト", "16233", "SN123", "3135", "2026/10/3", "PT-000123"]) {
    assert.ok(printed.includes(value), value);
  }
  assert.ok(!printed.includes(label.qrPayload));
});

test("long B2B values render as exactly one 62 × 75 mm PDF page", async () => {
  Font.clear();
  Font.register({ family: "Helvetica", src: "Helvetica" });
  Font.register({ family: "NotoSansJP", src: path.join(process.cwd(), "public/fonts/NotoSansJP-Regular.otf") });
  const longLabel = { ...label,
    customerName: "取引先会社名".repeat(2), model: "デイトジャスト".repeat(2),
    partnerRef: "取引先管理番号".repeat(4), endUserName: "最終所有者氏名".repeat(4),
    serialNumber: "シリアル番号".repeat(5), caliber: "ムーブメント".repeat(5),
    reference: "1234567890".repeat(5), brand: "ブランド名".repeat(5),
  };
  const qrCodeDataUrl = await QRCode.toDataURL(longLabel.qrPayload, { width: 480, margin: 4 });
  const blob = await pdf(<TagDocument label={longLabel} qrCodeDataUrl={qrCodeDataUrl} />).toBlob();
  const bytes = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.equal((bytes.match(/\/Type\s*\/Page\b/g) ?? []).length, 1);
  const mediaBox = bytes.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  assert.ok(mediaBox, "PDF MediaBox");
  assert.ok(Math.abs(Number(mediaBox[1]) - TAG_PAGE_SIZE[0]) < 0.01);
  assert.ok(Math.abs(Number(mediaBox[2]) - TAG_PAGE_SIZE[1]) < 0.01, mediaBox[0]);

  const printed = elements(TagDocument({ label: longLabel, qrCodeDataUrl }))
    .filter(node => node.type === Text).map(node => elementsText(node.props.children as ReactNode)).join(" ");
  for (const field of ["受付", "取引先管理番号", "取引先", "エンドユーザー", "ブランド",
    "モデル", "Ref.", "シリアル", "Cal.", "受付日", "PT-000123"]) {
    assert.ok(printed.includes(field), field);
  }
  assert.ok(printed.includes("…"));
});

test("missing optional fields do not print placeholder rows", () => {
  const sparse = { ...label, customerType: "individual" as const, partnerRef: null,
    endUserName: null, reference: "", serialNumber: null, caliber: null, receptionDate: null };
  const printed = elements(TagDocument({ label: sparse, qrCodeDataUrl: "data:image/png;base64,AA==" }))
    .filter(node => node.type === Text).map(node => elementsText(node.props.children as ReactNode)).join(" ");
  assert.ok(printed.includes("お客様 取引先会社"));
  for (const absent of ["取引先管理番号", "エンドユーザー", "Ref.", "シリアル", "Cal.", "受付日", "—"]) {
    assert.ok(!printed.includes(absent), absent);
  }
});

function elementsText(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(elementsText).join("");
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
