import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

// Register fonts
Font.register({
    family: 'Noto Sans JP',
    src: '/fonts/NotoSansJP-Regular.otf',

});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Noto Sans JP', fontSize: 10, color: '#333' },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 5 },
    title: { fontSize: 18, fontWeight: 'bold' },
    date: { fontSize: 10 },

    // Table
    tableContainer: { marginTop: 10, borderTopWidth: 2, borderTopColor: '#333' },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 4, alignItems: 'center', minHeight: 20 },
    headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', backgroundColor: '#f9f9f9', paddingVertical: 4, fontSize: 9, fontWeight: 'bold' },

    // Columns
    colDate: { width: '10%' },
    colId: { width: '10%' },
    colCustomer: { width: '20%' },
    colWatch: { width: '25%' },
    colTech: { width: '10%', textAlign: 'right' },
    colParts: { width: '10%', textAlign: 'right' },
    colTotal: { width: '15%', textAlign: 'right' },

    // Summary
    summaryArea: { marginTop: 20, alignItems: 'flex-end' },
    summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', width: '50%', marginBottom: 3 },
    summaryLabel: { width: '40%', textAlign: 'right', marginRight: 10 },
    summaryValue: { width: '30%', textAlign: 'right', fontWeight: 'bold' },
});

interface SalesItem {
    id: string;
    date: string;
    customerName: string;
    watchInfo: string;
    techFee: number;
    partsFee: number;
}

export interface SalesDocumentProps {
    data: {
        month: string;
        items: SalesItem[];
    }
}

export function SalesDocument({ data }: SalesDocumentProps) {
    const totalTech = data.items.reduce((sum, item) => sum + item.techFee, 0);
    const totalParts = data.items.reduce((sum, item) => sum + item.partsFee, 0);
    const subTotal = totalTech + totalParts;
    const tax = subTotal * 0.1;
    const grandTotal = subTotal + tax;

    return (
        <Document>
            <Page size="A4" style={styles.page} orientation="landscape">
                <View style={styles.header}>
                    <Text style={styles.title}>{data.month} 月次売上報告書</Text>
                    <Text style={styles.date}>作成日: {new Date().toLocaleDateString()}</Text>
                </View>

                {/* Table Header */}
                <View style={styles.headerRow}>
                    <Text style={styles.colDate}>完了日</Text>
                    <Text style={styles.colId}>管理No</Text>
                    <Text style={styles.colCustomer}>顧客名</Text>
                    <Text style={styles.colWatch}>時計詳細</Text>
                    <Text style={styles.colTech}>技術料</Text>
                    <Text style={styles.colParts}>部品代</Text>
                    <Text style={styles.colTotal}>小計</Text>
                </View>

                {/* Table Body */}
                <View style={styles.tableContainer}>
                    {data.items.map((item, idx) => (
                        <View key={idx} style={styles.row}>
                            <Text style={styles.colDate}>{item.date}</Text>
                            <Text style={styles.colId}>{item.id}</Text>
                            <Text style={styles.colCustomer}>{item.customerName}</Text>
                            <Text style={styles.colWatch}>{item.watchInfo}</Text>
                            <Text style={styles.colTech}>¥{item.techFee.toLocaleString()}</Text>
                            <Text style={styles.colParts}>¥{item.partsFee.toLocaleString()}</Text>
                            <Text style={styles.colTotal}>¥{(item.techFee + item.partsFee).toLocaleString()}</Text>
                        </View>
                    ))}
                </View>

                {/* Summary */}
                <View style={styles.summaryArea}>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>技術料合計</Text>
                        <Text style={styles.summaryValue}>¥{totalTech.toLocaleString()}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>部品代合計</Text>
                        <Text style={styles.summaryValue}>¥{totalParts.toLocaleString()}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>消費税 (10%)</Text>
                        <Text style={styles.summaryValue}>¥{tax.toLocaleString()}</Text>
                    </View>
                    <View style={[styles.summaryRow, { borderTopWidth: 1, borderColor: '#333', paddingTop: 5 }]}>
                        <Text style={[styles.summaryLabel, { fontSize: 12 }]}>総合計</Text>
                        <Text style={[styles.summaryValue, { fontSize: 12 }]}>¥{grandTotal.toLocaleString()}</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}
