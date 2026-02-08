
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

    summaryArea: { marginTop: 20, alignItems: 'flex-end' },
    summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', width: '50%', marginBottom: 3 },
    summaryLabel: { width: '40%', textAlign: 'right', marginRight: 10, fontSize: 9 },
    summaryValue: { width: '30%', textAlign: 'right', fontSize: 10 },
    grandTotal: { borderTopWidth: 2, borderColor: '#333', paddingTop: 4, fontWeight: 'bold' }
});

// --- V2 DELIVERY DOCUMENT ---
// Rules: B2B List Format, Grand Total Required, Serial/Ref Required, Shipping Fee Required.

export interface DeliveryDocumentProps {
    data: {
        deliveryNumber: string;
        date: string;
        customer: { name: string; address?: string; };
        jobs: {
            inquiryNumber: string;
            endUserName?: string;
            partnerRef?: string;
            watch: { brand: string; model: string; ref?: string; serial?: string; };
            items: { name: string; price: number; }[];
        }[];
        taxRate: number; // 0.1
        shippingFee: number; // Added
    }
}

export function DeliveryDocument({ data }: DeliveryDocumentProps) {
    // Calc Totals
    const subTotal = data.jobs.reduce((sum, job) => sum + job.items.reduce((s, i) => s + i.price, 0), 0);
    const tax = Math.floor(subTotal * data.taxRate);
    const grandTotal = subTotal + tax + (data.shippingFee || 0);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* HEAD */}
                <View style={styles.header}>
                    <Text style={styles.title}>納 品 書</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.date}>発行日: {data.date}</Text>
                        <Text style={{ fontSize: 10, marginTop: 2 }}>伝票No. {data.deliveryNumber}</Text>
                    </View>
                </View>

                {/* INFO */}
                <View style={styles.infoArea}>
                    <View style={{ width: '55%' }}>
                        <Text style={styles.recipient}>{data.customer.name} 御中</Text>
                        <Text style={{ fontSize: 9, color: '#555', marginTop: 4 }}>{data.customer.address || ""}</Text>
                        <Text style={{ fontSize: 9, marginTop: 10 }}>ご依頼の修理が完了いたしましたので、下記の通り納品申し上げます。</Text>
                    </View>
                    <View style={{ width: '40%' }}>
                        <Text style={styles.sender}>ヨシダ時計修理工房</Text>
                        <Text style={styles.sender}>〒104-0061 東京都中央区銀座 1-2-3</Text>
                        <Text style={styles.sender}>TEL: 03-1234-5678</Text>
                        <Text style={styles.sender}>登録番号: T1234567890123</Text>
                    </View>
                </View>

                {/* LIST TABLE */}
                <View style={styles.b2bContainer}>
                    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000', paddingBottom: 4, marginBottom: 4 }}>
                        <Text style={[styles.colNo, { width: '5%' }]}>No.</Text>
                        <Text style={[styles.colInquiry, { width: '10%' }]}>管理No</Text>
                        <Text style={[styles.colInquiry, { width: '10%' }]}>貴社管理No</Text>
                        <Text style={[styles.colEndUser, { width: '15%' }]}>顧客名</Text>
                        <Text style={[styles.colWatch, { width: '35%' }]}>時計情報 (Ref含) / 明細(単価)</Text>
                        <Text style={[styles.colTotal, { width: '15%' }]}>小計(税抜)</Text>
                    </View>

                    {data.jobs.map((job, idx) => {
                        const jobTotal = job.items.reduce((s, i) => s + i.price, 0);
                        // FIXED: Added Ref to watch info
                        const watchInfo = `${job.watch.brand} ${job.watch.model}\nRef: ${job.watch.ref || '-'} / Ser: ${job.watch.serial || '-'}`;

                        return (
                            <View key={idx} style={styles.b2bRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={[styles.colNo, { width: '5%' }]}>{idx + 1}</Text>
                                    <Text style={[styles.colInquiry, { width: '10%' }]}>{job.inquiryNumber}</Text>
                                    <Text style={[styles.colInquiry, { width: '10%', fontSize: 8 }]}>{job.partnerRef || '-'}</Text>
                                    <Text style={[styles.colEndUser, { width: '15%' }]}>{job.endUserName || '-'}</Text>

                                    <View style={{ width: '35%' }}>
                                        <Text style={{ fontSize: 9, fontWeight: 'bold', marginBottom: 2 }}>{watchInfo}</Text>
                                        <View style={{ borderLeftWidth: 1, borderColor: '#eee', paddingLeft: 4 }}>
                                            {job.items.map((item, i) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                                                    <Text style={{ fontSize: 7, color: '#555', width: '75%' }}>- {item.name}</Text>
                                                    <Text style={{ fontSize: 7, color: '#333', width: '25%', textAlign: 'right' }}>¥{item.price.toLocaleString()}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>

                                    <Text style={[styles.colTotal, { width: '15%' }]}>¥{jobTotal.toLocaleString()}</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* TOTALS */}
                <View style={styles.summaryArea}>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>小計</Text>
                        <Text style={styles.summaryValue}>¥{subTotal.toLocaleString()}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>消費税 (10%)</Text>
                        <Text style={styles.summaryValue}>¥{tax.toLocaleString()}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>送料</Text>
                        <Text style={styles.summaryValue}>¥{(data.shippingFee || 0).toLocaleString()}</Text>
                    </View>
                    <View style={[styles.summaryRow, styles.grandTotal]}>
                        <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>合計金額</Text>
                        <Text style={[styles.summaryValue, { fontWeight: 'bold', fontSize: 12 }]}>¥{grandTotal.toLocaleString()}</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}
