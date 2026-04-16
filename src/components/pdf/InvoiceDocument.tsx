
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
    b2bRow: { borderBottomWidth: 1, borderColor: '#ccc', paddingVertical: 4 }, // No minHeight for tight list

    colDate: { fontSize: 9, width: '10%' },
    colSlip: { fontSize: 9, width: '15%' }, // Slip No
    colDesc: { fontSize: 9, width: '45%' }, // Description
    colAmount: { fontSize: 10, width: '15%', textAlign: 'right' },
    colTax: { fontSize: 9, width: '10%', textAlign: 'right', color: '#666' },

    bankInfo: { marginTop: 20, padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, backgroundColor: '#f9f9f9' },

    summaryArea: { marginTop: 20, alignItems: 'flex-end' },
    summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', width: '50%', marginBottom: 3 },
    summaryLabel: { width: '40%', textAlign: 'right', marginRight: 10, fontSize: 9 },
    summaryValue: { width: '30%', textAlign: 'right', fontSize: 10 },
    grandTotal: { borderTopWidth: 2, borderColor: '#333', paddingTop: 4, fontWeight: 'bold' }
});

// --- V2 INVOICE DOCUMENT ---
// Rules: B2B Aggregated List (Monthly or Per-Batch), with Bank Info & Due Date.

export interface InvoiceDocumentProps {
    data: {
        invoiceNumber: string;
        date: string;
        dueDate: string; // 支払期限
        customer: { name: string; address?: string; };
        items: {
            date: string; // Delivery Date
            slipNumber: string; // Delivery Slip No
            description: string; // "Repairs (10 items)" or specific watch name
            amount: number;
        }[];
        taxRate: number;
        bankInfo?: string;
    }
}

export function InvoiceDocument({ data }: InvoiceDocumentProps) {
    // Calc
    const subTotal = data.items.reduce((sum, item) => sum + item.amount, 0);
    const tax = Math.floor(subTotal * data.taxRate);
    const grandTotal = subTotal + tax;

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* HEAD */}
                <View style={styles.header}>
                    <Text style={styles.title}>御 請 求 書</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.date}>発行日: {data.date}</Text>
                        <Text style={{ fontSize: 10, marginTop: 2 }}>No. {data.invoiceNumber}</Text>
                    </View>
                </View>

                {/* INFO */}
                <View style={styles.infoArea}>
                    <View style={{ width: '55%' }}>
                        <Text style={styles.recipient}>{data.customer.name} 御中</Text>
                        <Text style={{ fontSize: 9, color: '#555', marginTop: 4 }}>{data.customer.address || ""}</Text>
                        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold' }}>ご請求金額: </Text>
                            <Text style={{ fontSize: 14, fontWeight: 'bold', textDecoration: 'underline' }}>¥{grandTotal.toLocaleString()}-</Text>
                        </View>
                        <Text style={{ fontSize: 9, marginTop: 4, color: '#d00' }}>お支払期限: {data.dueDate}</Text>
                    </View>
                    <View style={{ width: '40%' }}>
                        <Text style={styles.sender}>ヨシダ時計修理工房</Text>
                        <Text style={styles.sender}>〒651-1213 神戸市北区広陵町1-162-1-401</Text>
                        <Text style={styles.sender}>TEL: 090-2041-8275</Text>
                    </View>
                </View>

                {/* LIST TABLE */}
                <View style={styles.b2bContainer}>
                    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000', paddingBottom: 4, marginBottom: 4 }}>
                        <Text style={styles.colDate}>日付</Text>
                        <Text style={styles.colSlip}>納品書No</Text>
                        <Text style={styles.colDesc}>適用</Text>
                        <Text style={styles.colAmount}>金額(税抜)</Text>
                    </View>

                    {data.items.map((item, idx) => (
                        <View key={idx} style={styles.b2bRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.colDate}>{item.date}</Text>
                                <Text style={styles.colSlip}>{item.slipNumber}</Text>
                                <Text style={styles.colDesc}>{item.description}</Text>
                                <Text style={styles.colAmount}>¥{item.amount.toLocaleString()}</Text>
                            </View>
                        </View>
                    ))}
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
                    <View style={[styles.summaryRow, styles.grandTotal]}>
                        <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>合計ご請求額</Text>
                        <Text style={[styles.summaryValue, { fontWeight: 'bold', fontSize: 12 }]}>¥{grandTotal.toLocaleString()}</Text>
                    </View>
                </View>

                {/* BANK INFO */}
                <View style={styles.bankInfo}>
                    <Text style={{ fontSize: 9, fontWeight: 'bold', marginBottom: 4 }}>【お振込先】</Text>
                    <Text style={{ fontSize: 9 }}>三井住友銀行</Text>
                    <Text style={{ fontSize: 9 }}>普通 3602468</Text>
                    <Text style={{ fontSize: 9, marginBottom: 4 }}>ヨシダ シュウヘイ</Text>
                </View>
            </Page>
        </Document>
    );
}
