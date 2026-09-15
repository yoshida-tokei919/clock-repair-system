import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({ family: 'Noto Sans JP', src: '/fonts/NotoSansJP-Regular.otf' });

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: 'Noto Sans JP', fontSize: 10, color: '#333' },
  header: { marginBottom: 20, borderBottomWidth: 1, borderColor: '#333', paddingBottom: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 18, fontWeight: 'bold' }, date: { fontSize: 10 },
  infoArea: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  recipient: { fontSize: 12, borderBottomWidth: 1, borderColor: '#ccc', paddingBottom: 2 },
  sender: { fontSize: 9, textAlign: 'right', lineHeight: 1.3 },
  b2bContainer: { marginTop: 10, borderTopWidth: 2, borderColor: '#333' },
  b2bRow: { borderBottomWidth: 1, borderColor: '#ccc', paddingVertical: 4 },
  colSlip: { fontSize: 9, width: '25%' }, colDate: { fontSize: 9, width: '20%' },
  colDesc: { fontSize: 9, width: '30%' }, colAmount: { fontSize: 10, width: '25%', textAlign: 'right' },
  b2cJob: { borderWidth: 1, borderColor: '#d7dde5', borderRadius: 4, padding: 10, marginBottom: 8 },
  b2cJobHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  b2cWatch: { fontSize: 10, fontWeight: 'bold', lineHeight: 1.5 },
  b2cWork: { fontSize: 9, lineHeight: 1.5, color: '#444', marginTop: 5 },
  bankInfo: { marginTop: 20, padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, backgroundColor: '#f9f9f9' },
  summaryArea: { marginTop: 20, alignItems: 'flex-end' },
  summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', width: '50%', marginBottom: 3 },
  summaryLabel: { width: '40%', textAlign: 'right', marginRight: 10, fontSize: 9 },
  summaryValue: { width: '30%', textAlign: 'right', fontSize: 10 },
  grandTotal: { borderTopWidth: 2, borderColor: '#333', paddingTop: 4, fontWeight: 'bold' },
});

export interface InvoiceDocumentProps {
  data: {
    invoiceNumber: string; date: string; dueDate: string;
    customer: { name: string; address?: string; type?: string };
    items: { date: string; slipNumber: string; description: string; amount: number }[];
    taxRate: number; subtotalAmount?: number; taxAmount?: number; grossTotalAmount?: number; bankInfo?: string;
    b2cJobs?: { inquiryNumber: string; watch: { brand: string; model: string; ref?: string; serial?: string }; workDescriptions: string[]; amount: number }[];
  };
}

export function InvoiceDocument({ data }: InvoiceDocumentProps) {
  const isB2C = data.customer.type === 'individual';
  const subTotal = data.subtotalAmount ?? data.items.reduce((sum, item) => sum + item.amount, 0);
  const tax = data.taxAmount ?? Math.floor(subTotal * data.taxRate);
  const grandTotal = data.grossTotalAmount ?? subTotal + tax;
  const b2cRecipientName = data.customer.name.trim().replace(/\s*(御中|様)$/, '');

  return <Document><Page size="A4" style={styles.page}>
    <View style={styles.header}><Text style={styles.title}>請求書</Text><View style={{ alignItems: 'flex-end' }}><Text style={styles.date}>発行日: {data.date}</Text><Text style={{ fontSize: 10, marginTop: 2 }}>No. {data.invoiceNumber}</Text></View></View>
    <View style={styles.infoArea}><View style={{ width: '55%' }}><Text style={styles.recipient}>{isB2C ? `${b2cRecipientName} 様` : `${data.customer.name} 御中`}</Text><Text style={{ fontSize: 9, color: '#555', marginTop: 4 }}>{data.customer.address || ''}</Text><View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}><Text style={{ fontSize: 10, fontWeight: 'bold' }}>ご請求金額 </Text><Text style={{ fontSize: 14, fontWeight: 'bold', textDecoration: 'underline' }}>¥{grandTotal.toLocaleString()}-</Text></View></View><View style={{ width: '40%' }}><Text style={styles.sender}>ヨシダ時計修理工房</Text><Text style={styles.sender}>〒651-1213 神戸市北区広陵町1-162-1-401</Text><Text style={styles.sender}>TEL: 090-2041-8275</Text><Text style={styles.sender}>支払期限: {data.dueDate}</Text></View></View>
    {isB2C ? <View style={{ marginTop: 10 }}>{(data.b2cJobs ?? []).map((job, idx) => { const watchLines = [[job.watch.brand, job.watch.model].filter(Boolean).join(' '), job.watch.ref ? `Ref: ${job.watch.ref}` : '', job.watch.serial ? `Serial: ${job.watch.serial}` : ''].filter(Boolean).join('\n'); return <View key={`${job.inquiryNumber}-${idx}`} style={styles.b2cJob}><View style={styles.b2cJobHeader}><Text style={{ fontSize: 9, color: '#555' }}>修理番号: {job.inquiryNumber}</Text><Text style={{ fontSize: 11, fontWeight: 'bold' }}>¥{job.amount.toLocaleString()}</Text></View><Text style={styles.b2cWatch}>{watchLines}</Text><Text style={styles.b2cWork}>作業内容: {job.workDescriptions.join('、') || '修理作業'}</Text></View>; })}</View> : <View style={styles.b2bContainer}><View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000', paddingBottom: 4, marginBottom: 4 }}><Text style={styles.colSlip}>納品書番号</Text><Text style={styles.colDate}>納品日</Text><Text style={styles.colDesc}>納品内容</Text><Text style={styles.colAmount}>金額</Text></View>{data.items.map((item, idx) => <View key={idx} style={styles.b2bRow}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={styles.colSlip}>{item.slipNumber}</Text><Text style={styles.colDate}>{item.date}</Text><Text style={styles.colDesc}>{item.description}</Text><Text style={styles.colAmount}>¥{item.amount.toLocaleString()}</Text></View></View>)}</View>}
    <View style={styles.summaryArea}><View style={styles.summaryRow}><Text style={styles.summaryLabel}>小計</Text><Text style={styles.summaryValue}>¥{subTotal.toLocaleString()}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>消費税 ({Math.round(data.taxRate * 100)}%)</Text><Text style={styles.summaryValue}>¥{tax.toLocaleString()}</Text></View><View style={[styles.summaryRow, styles.grandTotal]}><Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>合計請求額</Text><Text style={[styles.summaryValue, { fontWeight: 'bold', fontSize: 12 }]}>¥{grandTotal.toLocaleString()}</Text></View></View>
    {isB2C ? <View style={{ marginTop: 20, paddingTop: 10, borderTopWidth: 1, borderColor: '#ccc' }}><Text style={{ fontSize: 9 }}>お支払い方法のご案内はお客様専用ページをご確認ください。</Text></View> : <View style={styles.bankInfo}><Text style={{ fontSize: 9, fontWeight: 'bold', marginBottom: 4 }}>お振込先</Text>{data.bankInfo ? <Text style={{ fontSize: 9 }}>{data.bankInfo}</Text> : <><Text style={{ fontSize: 9 }}>三井住友銀行　船橋支店411</Text><Text style={{ fontSize: 9 }}>普通　3602468</Text><Text style={{ fontSize: 9 }}>ヨシダ シュウヘイ</Text></>}</View>}
  </Page></Document>;
}
