import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PhysicalTagLabel } from "@/lib/physical-tag-label";

Font.register({ family: "NotoSansJP", src: "/fonts/NotoSansJP-Regular.otf" });

const mmToPt = (mm: number) => mm * 72 / 25.4;
export const TAG_PAGE_SIZE: [number, number] = [mmToPt(62), mmToPt(75)];
export const TAG_QR_SIZE = mmToPt(28);

// One CJK glyph can occupy roughly one font-size unit. Reserve one fixed line
// for each field so long values cannot push the QR onto another sheet.
function fitLine(value: string, maxCharacters: number): string {
  const characters = Array.from(value);
  return characters.length <= maxCharacters
    ? value
    : `${characters.slice(0, maxCharacters - 1).join("")}…`;
}

const styles = StyleSheet.create({
  page: { fontFamily: "NotoSansJP", padding: mmToPt(2), backgroundColor: "#fff" },
  inquiry: { fontSize: 11, height: mmToPt(5) },
  partner: { fontSize: 8, height: mmToPt(5) },
  customer: { fontSize: 10, height: mmToPt(5) },
  endUser: { fontSize: 8, height: mmToPt(5) },
  brand: { fontSize: 10, height: mmToPt(5) },
  model: { fontSize: 10, height: mmToPt(5) },
  reference: { fontSize: 9, height: mmToPt(5) },
  bottom: { flexDirection: "row", alignItems: "flex-end", marginTop: "auto" },
  qr: { width: TAG_QR_SIZE, height: TAG_QR_SIZE },
  details: { flex: 1, paddingLeft: 4, paddingBottom: 2 },
  detail: { fontSize: 7, height: mmToPt(4) },
  tag: { fontSize: 9, height: mmToPt(4) },
});

export function TagDocument({ label, qrCodeDataUrl }: {
  label: PhysicalTagLabel; qrCodeDataUrl: string;
}) {
  return (
    <Document>
      <Page size={TAG_PAGE_SIZE} style={styles.page}>
        <Text style={styles.inquiry} wrap={false}>{fitLine(`受付 ${label.inquiryNumber}`, 14)}</Text>
        {label.partnerRef && <Text style={styles.partner} wrap={false}>{fitLine(`取引先管理番号 ${label.partnerRef}`, 20)}</Text>}
        <Text style={styles.customer} wrap={false}>
          {fitLine(`${label.customerType === "business" ? "取引先 " : "お客様 "}${label.customerName}`, 16)}
        </Text>
        {label.endUserName && <Text style={styles.endUser} wrap={false}>{fitLine(`エンドユーザー ${label.endUserName}`, 20)}</Text>}
        {label.brand && <Text style={styles.brand} wrap={false}>{fitLine(`ブランド ${label.brand}`, 16)}</Text>}
        {label.model && <Text style={styles.model} wrap={false}>{fitLine(`モデル ${label.model}`, 16)}</Text>}
        {label.reference && <Text style={styles.reference} wrap={false}>{fitLine(`Ref. ${label.reference}`, 18)}</Text>}
        <View style={styles.bottom} wrap={false}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={qrCodeDataUrl} style={styles.qr} />
          <View style={styles.details}>
            {label.serialNumber && <Text style={styles.detail} wrap={false}>{fitLine(`シリアル ${label.serialNumber}`, 11)}</Text>}
            {label.caliber && <Text style={styles.detail} wrap={false}>{fitLine(`Cal. ${label.caliber}`, 11)}</Text>}
            {label.receptionDate && <Text style={styles.detail} wrap={false}>{fitLine(`受付日 ${label.receptionDate}`, 16)}</Text>}
            <Text style={styles.tag} wrap={false}>{fitLine(label.shortCode, 9)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
