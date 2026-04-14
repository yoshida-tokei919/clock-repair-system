import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
    family: 'Noto Sans JP',
    src: '/fonts/NotoSansJP-Regular.otf',

});

const styles = StyleSheet.create({
    page: { padding: 40, fontFamily: 'Noto Sans JP', fontSize: 10, color: '#333' },

    // Receipt Frame
    frame: { border: '2px solid #333', padding: 20, height: '45%' }, // Half page receipt

    title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },

    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' },

    // Amount Box
    amountBox: {
        borderBottomWidth: 2, borderBottomColor: '#333',
        width: '60%',
        alignItems: 'center', justifyContent: 'center',
        padding: 5,
        backgroundColor: '#fff' // In case of background
    },
    amountText: { fontSize: 20, fontWeight: 'bold' },

    label: { fontSize: 12 },
    value: { fontSize: 12, borderBottomWidth: 1, borderBottomColor: '#ccc', width: '60%', textAlign: 'center' },

    date: { textAlign: 'right', fontSize: 10, marginBottom: 20 },

    // Issuer Info
    issuer: { marginTop: 30, textAlign: 'right' },
    issuerName: { fontSize: 12, fontWeight: 'bold' },
    issuerAddr: { fontSize: 9 },

    stampProps: { width: 50, height: 50, borderWidth: 1, borderColor: '#ccc', position: 'absolute', right: 20, bottom: 20 }
});

export interface ReceiptDocumentProps {
    data: {
        date: string;
        customerName: string;
        amount: number;
        proviso: string; // 但し書き
    }
}

export function ReceiptDocument({ data }: ReceiptDocumentProps) {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Top Half Receipt */}
                <View style={styles.frame}>
                    <Text style={styles.date}>{data.date}</Text>

                    <View style={styles.row}>
                        <Text style={[styles.value, { textAlign: 'left', width: '70%', fontSize: 14 }]}>{data.customerName} 様</Text>
                    </View>

                    <Text style={styles.title}>領収書</Text>

                    <View style={{ alignItems: 'center', marginBottom: 20, marginTop: 10 }}>
                        <View style={styles.amountBox}>
                            <Text style={styles.amountText}>¥{data.amount.toLocaleString()} -</Text>
                        </View>
                        <Text style={{ fontSize: 10, marginTop: 4 }}>正に領収いたしました</Text>
                    </View>

                    <View style={styles.row}>
                        <Text style={styles.label}>但</Text>
                        <Text style={[styles.value, { width: '85%', textAlign: 'left' }]}>{data.proviso}</Text>
                    </View>

                    <View style={styles.issuer}>
                        <Text style={styles.issuerName}>ヨシダ時計修理工房</Text>
                        <Text style={styles.issuerAddr}>〒651-1213 神戸市北区広陵町1-162-1-401</Text>
                        <Text style={styles.issuerAddr}>TEL: 090-2041-8275</Text>
                        {/* Stamp Placeholder */}
                        <View style={{ width: 60, height: 60, borderWidth: 1, borderColor: '#f00', position: 'absolute', right: 0, top: -10, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#f00', fontSize: 8 }}>印</Text>
                        </View>
                    </View>
                </View>
            </Page>
        </Document>
    );
}
