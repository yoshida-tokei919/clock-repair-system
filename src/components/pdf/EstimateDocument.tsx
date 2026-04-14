
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Noto Sans JP',
  src: '/fonts/NotoSansJP-Regular.otf',
});

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: 'Noto Sans JP', fontSize: 10, color: '#333' },
  header: { marginBottom: 20, borderBottomWidth: 1, borderColor: '#333', paddingBottom: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 18, fontWeight: 'bold' },
  date: { fontSize: 10 },
  infoArea: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  recipient: { fontSize: 12, borderBottomWidth: 1, borderColor: '#ccc', paddingBottom: 2 },
  sender: { fontSize: 9, textAlign: 'right', lineHeight: 1.3 },
  b2bContainer: { marginTop: 10, borderTopWidth: 2, borderColor: '#333' },
  b2bRow: { borderBottomWidth: 1, borderColor: '#ccc', paddingVertical: 4 },
  colNo: { fontSize: 9, fontWeight: 'bold' },
  colInquiry: { fontSize: 9 },
  colEndUser: { fontSize: 9 },
  colWatch: { fontSize: 9, fontWeight: 'bold' },
  colTotal: { fontSize: 10, textAlign: 'right', fontWeight: 'bold' },
});

// --- V2 ESTIMATE DOCUMENT ---
// Rules: B2B List Format, No Grand Total, Serial/EndUser/PartnerRef Required.
// RULE: Must separate Parts and Labor. Must show individual prices for all items.

export interface EstimateDocumentProps {
  data: {
    estimateNumber: string;
    date: string;
    customer: { name: string; address?: string; };
    jobs: {
      id: string; // Internal ID
      inquiryNumber: string;
      partnerRef?: string; // 貴社管理No
      endUserName?: string;
      watch: { brand: string; model: string; ref?: string; serial?: string; };
      diagnosis?: string;
      items: { name: string; price: number; }[];
    }[];
  }
}

export function EstimateDocument({ data }: EstimateDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEAD */}
        <View style={styles.header}>
          <Text style={styles.title}>御 見 積 書</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.date}>発行日: {data.date}</Text>
            <Text style={{ fontSize: 10, marginTop: 2 }}>No. {data.estimateNumber}</Text>
          </View>
        </View>

        {/* INFO */}
        <View style={styles.infoArea}>
          <View style={{ width: '55%' }}>
            <Text style={styles.recipient}>{data.customer.name} 御中</Text>
            <Text style={{ fontSize: 9, color: '#555', marginTop: 4 }}>{data.customer.address || ""}</Text>
            <Text style={{ fontSize: 9, marginTop: 10 }}>下記修理のお見積りを申し上げます。</Text>
          </View>
          <View style={{ width: '40%' }}>
            <Text style={styles.sender}>ヨシダ時計修理工房</Text>
            <Text style={styles.sender}>〒651-1213 神戸市北区広陵町1-162-1-401</Text>
            <Text style={styles.sender}>TEL: 090-2041-8275</Text>
          </View>
        </View>

        {/* LIST TABLE (B2B Style) */}
        <View style={styles.b2bContainer}>
          {/* Table Header */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000', paddingBottom: 4, marginBottom: 4, alignItems: 'flex-end' }}>
            <Text style={[styles.colNo, { width: '5%' }]}>No.</Text>
            <Text style={[styles.colInquiry, { width: '10%' }]}>管理No</Text>
            <Text style={[styles.colInquiry, { width: '10%' }]}>貴社管理No</Text>
            <Text style={[styles.colEndUser, { width: '15%' }]}>顧客名</Text>
            <Text style={[styles.colWatch, { width: '30%' }]}>時計情報</Text>
            <Text style={[{ width: '20%' }, { fontSize: 9, borderLeftWidth: 1, borderColor: '#ccc', paddingLeft: 4 }]}>作業明細 / 単価</Text>
            <Text style={[styles.colTotal, { width: '10%' }]}>小計(税抜)</Text>
          </View>

          {/* Rows */}
          {data.jobs.map((job, idx) => {
            const jobTotal = job.items.reduce((s, i) => s + i.price, 0);
            const watchInfo = `${job.watch.brand} ${job.watch.model}\n${job.watch.ref || '-'} / Ser.${job.watch.serial || '-'}`;

            return (
              <View key={idx} style={[styles.b2bRow, { minHeight: 40 }]}>
                {/* Columns */}
                <View style={{ flexDirection: 'row' }}>
                  <Text style={[styles.colNo, { width: '5%' }]}>{idx + 1}</Text>
                  <Text style={[styles.colInquiry, { width: '10%' }]}>{job.inquiryNumber}</Text>
                  <Text style={[styles.colInquiry, { width: '10%', fontSize: 8 }]}>{job.partnerRef || '-'}</Text>
                  <Text style={[styles.colEndUser, { width: '15%' }]}>{job.endUserName || '-'}</Text>
                  <Text style={[styles.colWatch, { width: '30%', fontSize: 8 }]}>{watchInfo}</Text>

                  {/* Items Inner List with Prices */}
                  <View style={{ width: '20%', paddingLeft: 4, borderLeftWidth: 1, borderColor: '#eee' }}>
                    {job.items.map((item, i) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                        <Text style={{ fontSize: 7, width: '70%' }}>・{item.name}</Text>
                        <Text style={{ fontSize: 7, width: '30%', textAlign: 'right', fontFamily: 'Helvetica' }}>¥{item.price.toLocaleString()}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={[styles.colTotal, { width: '10%' }]}>¥{jobTotal.toLocaleString()}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* FOOTER NOTE (No Grand Total) */}
        <View style={{ marginTop: 20, borderTopWidth: 1, borderColor: '#ccc', paddingTop: 10 }}>
          <Text style={{ fontSize: 9 }}>※ 部品の在庫状況により納期が変動する場合がございます。</Text>
          <Text style={{ fontSize: 9 }}>※ 本見積書の有効期限は発行日より1ヶ月です。</Text>
        </View>
      </Page>
    </Document>
  );
}
