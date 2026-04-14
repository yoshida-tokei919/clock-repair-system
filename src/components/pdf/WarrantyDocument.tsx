
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font, Image } from '@react-pdf/renderer';

Font.register({
    family: 'Noto Sans JP',
    src: '/fonts/NotoSansJP-Regular.otf',
});

// A5 Landscape or Postcard size feel
const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontFamily: 'Noto Sans JP',
        fontSize: 10,
        color: '#333',
        flexDirection: 'column'
    },
    borderFrame: {
        borderWidth: 4,
        borderColor: '#0f172a', // Dark Navy
        height: '100%',
        padding: 20,
        display: 'flex',
        flexDirection: 'column'
    },
    header: {
        textAlign: 'center',
        marginBottom: 20,
        borderBottomWidth: 1,
        borderColor: '#ccc',
        paddingBottom: 10
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 4
    },
    subTitle: {
        fontSize: 10,
        color: '#666',
        letterSpacing: 2
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    row: {
        flexDirection: 'row',
        marginBottom: 12,
        alignItems: 'baseline'
    },
    label: {
        width: '30%',
        fontSize: 10,
        color: '#666',
        textAlign: 'right',
        paddingRight: 15
    },
    value: {
        width: '70%',
        fontSize: 14,
        fontWeight: 'bold',
        color: '#000'
    },
    guaranteePeriod: {
        marginTop: 15,
        marginBottom: 15,
        padding: 10,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        alignItems: 'center'
    },
    periodText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f172a'
    },
    footer: {
        marginTop: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end'
    },
    terms: {
        width: '70%',
        fontSize: 7,
        color: '#666',
        lineHeight: 1.4
    },
    qrArea: {
        width: '25%',
        alignItems: 'center'
    },
    qrPlaceholder: {
        width: 60,
        height: 60,
        backgroundColor: '#eee',
        marginBottom: 4
    }
});

// --- V2 WARRANTY DOCUMENT ---
// Rules: Luxury Design, A5 Landscape (simulated on A4 or actual if printer supports), QR Code.
// This template creates a nice bordered certificate style.

export interface WarrantyDocumentProps {
    data: {
        warrantyNumber: string;
        issueDate: string;
        guaranteeStart: string;
        guaranteeEnd: string;
        watch: { brand: string; model: string; ref?: string; serial: string; };
        repairSummary: string; // "Overhaul, Gaskets"
        qrCodeUrl?: string; // Data URL for QR Code image
    }
}

export function WarrantyDocument({ data }: WarrantyDocumentProps) {
    return (
        <Document>
            {/* A5 Landscape is typical for warranties */}
            <Page size="A5" orientation="landscape" style={styles.page}>
                <View style={styles.borderFrame}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>修理保証書</Text>
                        <Text style={styles.subTitle}>WATCH REPAIR GUARANTEE</Text>
                    </View>

                    {/* Main Info */}
                    <View style={styles.content}>
                        <View style={styles.row}>
                            <Text style={styles.label}>BRAND / MODEL</Text>
                            <Text style={styles.value}>{data.watch.brand} {data.watch.model}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>REF. / SERIAL</Text>
                            <Text style={styles.value}>{data.watch.ref || '-'} / {data.watch.serial}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>REPAIR CONTENT</Text>
                            <Text style={[styles.value, { fontSize: 11 }]}>{data.repairSummary}</Text>
                        </View>

                        {/* Period Box */}
                        <View style={styles.guaranteePeriod}>
                            <Text style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>保証期間 (Guarantee Period)</Text>
                            <Text style={styles.periodText}>{data.guaranteeStart} 〜 {data.guaranteeEnd}</Text>
                        </View>
                    </View>

                    {/* Footer / Terms / QR */}
                    <View style={styles.footer}>
                        <View style={styles.terms}>
                            <Text>【保証規定】</Text>
                            <Text>1. 通常使用において生じた自然故障に限り、期間内は無償で再修理いたします。</Text>
                            <Text>2. 以下の場合は保証対象外となります。</Text>
                            <Text>   ・誤ったご使用による故障（落下、衝撃、磁気帯び等）</Text>
                            <Text>   ・水入り、サビ、ケース・ガラス等の外装部品の損傷。</Text>
                            <Text>3. 本証の再発行は致しかねますので大切に保管してください。</Text>
                            <Text style={{ marginTop: 4, fontWeight: 'bold' }}>ヨシダ時計修理工房 TEL: 090-2041-8275</Text>
                        </View>

                        <View style={styles.qrArea}>
                            {data.qrCodeUrl ? (
                                <Image src={data.qrCodeUrl} style={{ width: 60, height: 60 }} />
                            ) : (
                                <View style={styles.qrPlaceholder} />
                            )}
                            <Text style={{ fontSize: 7, marginTop: 2 }}>Scan for Detail</Text>
                        </View>
                    </View>
                </View>
            </Page>
        </Document>
    );
}
