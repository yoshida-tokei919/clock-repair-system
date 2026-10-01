import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PhysicalTagLabel } from "@/lib/physical-tag-label";

Font.register({ family: "NotoSansJP", src: "/fonts/NotoSansJP-Regular.otf" });

// DK-1209 preview baseline: 62 mm × 29 mm (176 pt × 82 pt).
const styles = StyleSheet.create({
  page: { fontFamily: "NotoSansJP", flexDirection: "row", padding: 4, backgroundColor: "#fff" },
  text: { width: 117, justifyContent: "center", paddingRight: 3 },
  code: { fontSize: 9, marginBottom: 1 },
  line: { fontSize: 5.5, marginBottom: 1 },
  qr: { width: 50, height: 50, alignSelf: "center" },
});

export function TagDocument({ label, qrCodeDataUrl }: {
  label: PhysicalTagLabel; qrCodeDataUrl: string;
}) {
  return (
    <Document>
      <Page size={[176, 82]} style={styles.page}>
        <View style={styles.text}>
          <Text style={styles.code}>TAG {label.shortCode}</Text>
          <Text style={styles.line}>受付番号 {label.inquiryNumber}</Text>
          <Text style={styles.line}>取引先/顧客 {label.customerName}</Text>
          <Text style={styles.line}>ブランド {label.brand}</Text>
          <Text style={styles.line}>モデル {label.model}</Text>
          <Text style={styles.line}>Ref {label.reference}</Text>
          {label.receptionDate && <Text style={styles.line}>受付日 {label.receptionDate}</Text>}
        </View>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={qrCodeDataUrl} style={styles.qr} />
      </Page>
    </Document>
  );
}
