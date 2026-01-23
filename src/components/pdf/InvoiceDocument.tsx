import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Font Registration (reused)
Font.register({
    family: 'Noto Sans JP',
    src: '/fonts/NotoSansJP-Regular.otf',

});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Noto Sans JP', fontSize: 10, color: '#333', backgroundColor: '#fff' },
    header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    title: { fontSize: 18, fontWeight: 'bold' },
    date: { fontSize: 10 },
    infoArea: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    recipient: { fontSize: 12, borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 2 },
    sender: { fontSize: 9, textAlign: 'right', lineHeight: 1.3 },

    // Bank Info (New)
    bankInfo: { marginTop: 20, padding: 10, border: '1px solid #ccc', backgroundColor: '#f9f9f9' },
    bankTitle: { fontWeight: 'bold', marginBottom: 5 },
    bankText: { fontSize: 9, lineHeight: 1.4 },

    // B2B Styles
    b2bContainer: { marginTop: 10, borderTopWidth: 2, borderTopColor: '#333' },
    b2bRow: { borderBottomWidth: 1, borderBottomColor: '#ccc', paddingVertical: 6, minHeight: 50 },
    b2bLineHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    b2bLineDetail: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 85, marginBottom: 1 },
    colNo: { width: '5%', fontSize: 9, fontWeight: 'bold' },
    colInquiry: { width: '12%', fontSize: 9 },
    colEndUser: { width: '18%', fontSize: 9, fontWeight: 'bold' },
    colWatch: { width: '45%', fontSize: 9 },
    colTotal: { width: '20%', fontSize: 10, textAlign: 'right', fontWeight: 'bold' },

    // B2B Delivery Summary Styles
    colDate: { width: '15%', fontSize: 9, textAlign: 'center' },
    colSlipNo: { width: '20%', fontSize: 9, textAlign: 'left', paddingLeft: 5 },
    colDesc: { width: '30%', fontSize: 9, textAlign: 'left' },
    colCount: { width: '10%', fontSize: 9, textAlign: 'center' },
    colAmount: { width: '20%', fontSize: 9, textAlign: 'right', paddingRight: 5 },

    // B2C Styles
    b2cJobContainer: { marginBottom: 20 },
    b2cHeaderLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 8, marginBottom: 10, marginTop: 10 },
    b2cWatchInfo: { fontSize: 11, fontWeight: 'bold', flex: 1 },
    b2cInquiryNo: { fontSize: 10, color: '#666', marginLeft: 10 },
    b2cItemRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 8 },
    photoContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
    photo: { width: 150, height: 100, objectFit: 'cover', borderRadius: 4, backgroundColor: '#eee' },

    // Summary
    summaryArea: { marginTop: 20, alignItems: 'flex-end' },
    summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', width: '50%', marginBottom: 3 },
    summaryLabel: { width: '40%', textAlign: 'right', marginRight: 10, fontSize: 9 },
    summaryValue: { width: '30%', textAlign: 'right', fontSize: 10 },
    grandTotal: { borderTopWidth: 2, borderTopColor: '#333', paddingTop: 4, fontWeight: 'bold' }
});

// Reuse types from EstimateDocument if possible, but for standalone clarity defining here
interface RepairItem { name: string; qty: number; price: number; }
interface RepairJob {
    inquiryId?: string;
    partnerRef?: string;
    watch: { brand: string; model: string; ref?: string; serial: string; };
    endUser?: string;
    items: RepairItem[];
    photos?: string[];
}
export interface InvoiceDocumentProps {
    data: {
        id: string; // inquiryNumber
        invoiceNumber: string; // 正規の請求番号
        date: string; // Invoice Date
        customer: { name: string; type: 'individual' | 'business'; address?: string; };
        jobs: RepairJob[];
        deliveries?: { date: string; slipNo: string; count: number; amount: number; }[]; // B2B Delivery
    }
}

export function InvoiceDocument({ data }: InvoiceDocumentProps) {
    const isBusiness = data.customer.type === 'business';
    const grandTotal = data.jobs.reduce((sum, job) => sum + job.items.reduce((s, item) => s + (item.price * item.qty), 0), 0);
    const tax = grandTotal * 0.1;

    // --- Bank Info Component ---
    const BankInfoSection = () => (
        <View style={styles.bankInfo}>
            <Text style={styles.bankTitle}>お振込先</Text>
            <Text style={styles.bankText}>みずほ銀行 銀座支店 (店番: 123)</Text>
            <Text style={styles.bankText}>普通 1234567</Text>
            <Text style={styles.bankText}>カ) ヨシダトケイシュウリコウボウ</Text>
            <Text style={{ ...styles.bankText, marginTop: 4, color: '#666' }}>
                {isBusiness ? "※ 恐れ入りますが振込手数料は貴社にてご負担願います。" : "※ 恐れ入りますが振込手数料はお客様にてご負担願います。"}
            </Text>
            {/* Payment Terms for B2B */}
            {isBusiness && (
                <Text style={{ ...styles.bankText, marginTop: 4, fontWeight: 'bold' }}>
                    お支払い条件: 月末締め翌月末払い
                </Text>
            )}
        </View>
    );

    // --- B2B Render (Summary List Page) ---
    if (isBusiness) {
        return (
            <Document>
                <Page size="A4" style={styles.page}>
                    <HeaderSection data={data} title="御請求書" />

                    <View style={styles.b2bContainer}>
                        {/* Header Row */}
                        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 4, marginBottom: 4 }}>
                            <Text style={styles.colNo}>No.</Text>
                            <Text style={styles.colDate}>納品日</Text>
                            <Text style={styles.colSlipNo}>納品書番号</Text>
                            <Text style={styles.colDesc}>件名</Text>
                            <Text style={styles.colCount}>点数</Text>
                            <Text style={styles.colAmount}>金額(税込)</Text>
                        </View>

                        {(data.deliveries || []).map((delivery, idx) => (
                            <View key={idx} style={styles.b2bRow}>
                                <View style={styles.b2bLineHeader}>
                                    <Text style={styles.colNo}>{idx + 1}</Text>
                                    <Text style={styles.colDate}>{delivery.date}</Text>
                                    <Text style={styles.colSlipNo}>{delivery.slipNo}</Text>
                                    <Text style={styles.colDesc}>時計修理代金として</Text>
                                    <Text style={styles.colCount}>{delivery.count}</Text>
                                    <Text style={styles.colAmount}>¥{delivery.amount.toLocaleString()}</Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    <SummarySection grandTotal={grandTotal} tax={tax} />
                    <BankInfoSection />
                </Page>
            </Document>
        );
    }

    // --- B2C Render (Per Page) ---
    return (
        <Document>
            {(data.jobs || []).map((job, idx) => {
                const jobTotal = job.items.reduce((s, i) => s + i.price * i.qty, 0);
                return (
                    <Page key={idx} size="A4" style={styles.page}>
                        <HeaderSection data={data} title="御請求書" />

                        <View style={styles.b2cJobContainer}>
                            {/* Greetings for B2C */}
                            <Text style={{ fontSize: 10, marginBottom: 10 }}>
                                毎度ご利用いただき、誠にありがとうございます。
                                以下の通りご請求申し上げます。
                            </Text>

                            <View style={styles.b2cHeaderLine}>
                                <Text style={styles.b2cWatchInfo}>{job.watch.brand} {job.watch.model}</Text>
                                <Text style={styles.b2cInquiryNo}>お問合せNo: {job.inquiryId || `JK-${idx + 1}`}</Text>
                            </View>

                            <View style={{ marginTop: 10, marginBottom: 20 }}>
                                {job.items.map((item, i) => (
                                    <View key={i} style={styles.b2cItemRow}>
                                        <Text>{item.name}</Text>
                                        <Text>¥{item.price.toLocaleString()}</Text>
                                    </View>
                                ))}
                            </View>

                            {job.photos && job.photos.length > 0 && (
                                <View style={styles.photoContainer}>
                                    {job.photos.map((url, pIdx) => <Image key={pIdx} src={url} style={styles.photo} />)}
                                </View>
                            )}
                        </View>

                        <SummarySection grandTotal={jobTotal} tax={jobTotal * 0.1} />
                        <BankInfoSection />
                    </Page>
                );
            })}
        </Document>
    );
}

const HeaderSection = ({ data, title }: { data: InvoiceDocumentProps['data'], title: string }) => (
    <>
        <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.date}>{data.date}</Text>
                <Text style={{ fontSize: 9, marginTop: 4 }}>請求番号: {data.invoiceNumber}</Text>
            </View>
        </View>
        <View style={styles.infoArea}>
            <View>
                <Text style={styles.recipient}>
                    {data.customer.name} {data.customer.type === 'business' ? '御中' : '様'}
                </Text>
                {data.customer.address && <Text style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{data.customer.address}</Text>}
            </View>
            <View>
                <Text style={styles.sender}>ヨシダ時計修理工房</Text>
                <Text style={styles.sender}>〒104-0061 東京都中央区銀座 1-2-3</Text>
                <Text style={styles.sender}>TEL: 03-1234-5678</Text>
                <Text style={styles.sender}>登録番号: T1234567890123</Text>
            </View>
        </View>
    </>
);

const SummarySection = ({ grandTotal, tax }: { grandTotal: number, tax: number }) => (
    <View style={styles.summaryArea}>
        <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>小計</Text>
            <Text style={styles.summaryValue}>¥{grandTotal.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>消費税 (10%)</Text>
            <Text style={styles.summaryValue}>¥{tax.toLocaleString()}</Text>
        </View>
        <View style={[styles.summaryRow, styles.grandTotal]}>
            <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>ご請求金額</Text>
            <Text style={[styles.summaryValue, { fontWeight: 'bold', fontSize: 12 }]}>¥{(grandTotal + tax).toLocaleString()}</Text>
        </View>
    </View>
);
