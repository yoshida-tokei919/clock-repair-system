import React from "react";
import * as renderer from "@react-pdf/renderer";
import path from "node:path";
import type { ConsolidatedPdfData } from "./consolidated-invoice-publication";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;
const date = (value: Date) => value.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });

export async function renderConsolidatedInvoicePdf(data: ConsolidatedPdfData): Promise<Buffer> {
  const family = "Consolidated Invoice Noto Sans JP";
  renderer.Font.register({ family, src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf") });
  const { Document, Page, Text, View, StyleSheet } = renderer;
  const styles = StyleSheet.create({
    page: { padding: 32, fontFamily: family, fontSize: 10, color: "#222" },
    heading: { fontSize: 19, marginBottom: 12 },
    meta: { fontSize: 9, marginBottom: 4 },
    recipient: { fontSize: 12, marginTop: 12, marginBottom: 7 },
    section: { marginTop: 16, borderTopWidth: 1, borderColor: "#777", paddingTop: 7 },
    source: { marginTop: 8, paddingBottom: 7, borderBottomWidth: 0.5, borderColor: "#bbb" },
    note: { fontSize: 8, color: "#555", marginTop: 3 },
    total: { fontSize: 14, marginTop: 9 },
  });
  const bundle = data.bundle;
  const address = bundle.billingAddress || [bundle.billingPrefecture, bundle.billingCity, bundle.billingStreet, bundle.billingBuilding].filter(Boolean).join("");
  const pdf = <Document><Page size="A4" style={styles.page}>
    <Text style={styles.heading}>請求書（集約）</Text>
    <Text style={styles.meta}>集約請求 #{bundle.id}　発行日: {date(bundle.issueState!.issuedDate)}</Text>
    <Text style={styles.meta}>取引先グループ: {bundle.companyName}</Text>
    <Text style={styles.recipient}>{bundle.billingCompanyName || bundle.billingName} 御中</Text>
    {!!bundle.billingZipCode && <Text style={styles.meta}>〒{bundle.billingZipCode}</Text>}
    {!!address && <Text style={styles.meta}>{address}</Text>}
    <Text style={styles.total}>ご請求金額（税込） {yen(data.gross)}</Text>
    <View style={styles.section}>
      <Text>請求元: ヨシダ時計修理工房</Text>
      <Text style={styles.meta}>〒651-1213 神戸市北区広陵町1-162-1-401　TEL: 090-2041-8275</Text>
      <Text style={styles.meta}>支払期限: {data.dueDate ?? "未設定（元請求書の期限が一致しません）"}</Text>
    </View>
    <View style={styles.section}>
      <Text>元請求書（店舗別）</Text>
      {bundle.sources.map(source => <View key={source.id} style={styles.source} wrap={false}>
        <Text>{source.sourceCompanyName || source.sourceCustomerName}　{source.invoiceNumber}　税込 {yen(source.grossTotalAmount)}</Text>
        <Text style={styles.note}>税抜 {yen(source.totalAmount)} / 消費税 {yen(source.taxAmount)}{source.shippingFeeAmount > 0 ? ` / 送料（税込） ${yen(source.shippingFeeAmount)}` : ""}</Text>
        {source.deliveryNotes.map(note => <Text key={note.id} style={styles.note}>納品書 {note.slipNumber || (note.deliveryNoteId ? `#${note.deliveryNoteId}` : "未紐付け")} / {note.repairCount}点{note.subtotalAmount !== null ? ` / 税抜小計 ${yen(note.subtotalAmount)}` : ""}</Text>)}
      </View>)}
    </View>
    <View style={styles.section}>
      <Text>税抜小計 {yen(data.subtotal)}</Text>
      <Text>消費税（元請求書の確定税額合計） {yen(data.tax)}</Text>
      {data.shipping > 0 && <Text>送料（税込） {yen(data.shipping)}</Text>}
      <Text style={styles.total}>合計請求額（税込） {yen(data.gross)}</Text>
    </View>
    <View style={styles.section}>
      <Text>お振込先</Text>
      <Text>三井住友銀行　店番411　普通 3602468</Text>
      <Text>ヨシダ シュウヘイ</Text>
    </View>
  </Page></Document>;
  const stream = await renderer.renderToStream(pdf);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
