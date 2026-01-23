import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font, Image } from '@react-pdf/renderer';

// Font Registration
Font.register({
    family: 'Noto Sans JP',
    src: '/fonts/NotoSansJP-Regular.otf',

});

const styles = StyleSheet.create({
    page: { padding: 25, fontFamily: 'Noto Sans JP', fontSize: 10, color: '#333', backgroundColor: '#fff' },

    // Decorative Border
    borderFrame: {
        border: '4px double #444',
        padding: 15,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
    },

    header: { alignItems: 'center', marginBottom: 10, marginTop: 5, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 5 },
    title: { fontSize: 20, fontWeight: 'bold', marginBottom: 2 },
    subtitle: { fontSize: 8, color: '#666', letterSpacing: 2 },

    contentContainer: { marginBottom: 10 },

    section: { marginBottom: 10 },
    row: { flexDirection: 'row', marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 2, alignItems: 'center' },
    label: { width: '25%', color: '#666', fontSize: 9 },
    value: { width: '75%', fontSize: 9, fontWeight: 'bold' },

    termsContainer: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 8 },
    termsTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 3 },
    termText: { fontSize: 7, lineHeight: 1.5, color: '#555', marginBottom: 1 },

    footer: { alignItems: 'center', marginTop: 10 },
    shopName: { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
    shopAddress: { fontSize: 7, color: '#666', textAlign: 'center' }
});

export interface WarrantyDocumentProps {
    data: {
        id: string; // Warranty No
        repairId: string;
        customerName: string;
        customerType?: 'individual' | 'business';
        watch: { brand: string; model: string; ref: string; serial: string; };
        repairDate: string;
        expiryDate: string; // 1 Year later
        guaranteeContent: string; // e.g., "Overhaul"
    }
}

export const WarrantyDocument = ({ data }: WarrantyDocumentProps) => (
    <Document>
        <Page size="A5" orientation="landscape" style={styles.page}>
            <View style={styles.borderFrame}>

                <View style={styles.header}>
                    <Text style={styles.title}>修理保証書</Text>
                    <Text style={styles.subtitle}>CERTIFICATE OF GUARANTEE</Text>
                </View>

                <View style={styles.contentContainer}>
                    <View style={styles.section}>
                        <View style={styles.row}>
                            <Text style={styles.label}>お名前 (Customer)</Text>
                            <Text style={styles.value}>
                                {data.customerName} {data.customerType === 'business' ? '御中' : '様'}
                            </Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>修理完了日 (Date)</Text>
                            <Text style={styles.value}>{data.repairDate}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>保証期限 (Expiry)</Text>
                            <Text style={styles.value}>{data.expiryDate}</Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <View style={styles.row}>
                            <Text style={styles.label}>ブランド (Brand)</Text>
                            <Text style={styles.value}>{data.watch.brand}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>モデル (Model)</Text>
                            <Text style={styles.value}>{data.watch.model}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>リファレンス (Reference)</Text>
                            <Text style={styles.value}>{data.watch.ref}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>シリアル (Serial)</Text>
                            <Text style={styles.value}>{data.watch.serial}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.termsContainer}>
                    <Text style={styles.termsTitle}>保証規定</Text>
                    <View>
                        <Text style={styles.termText}>1. 本証は、当店にて修理を行った時計が、通常の使用状態で故障した場合に限り、規定の期間内無償で再修理を保証するものです。</Text>
                        <Text style={styles.termText}>2. 次の場合は保証期間内であっても有償修理となります。</Text>
                        <Text style={{ ...styles.termText, paddingLeft: 8 }}>・誤ったご使用による故障、または不当な修理や改造による故障。</Text>
                        <Text style={{ ...styles.termText, paddingLeft: 8 }}>・落下、衝撃、水入り（防水保証のない場合）による故障。</Text>
                        <Text style={{ ...styles.termText, paddingLeft: 8 }}>・外装部品（ケース、ガラス、ベルト等）の損傷、変化。</Text>
                        <Text style={styles.termText}>3. 本証の再発行は致しませんので大切に保管してください。</Text>
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.shopName}>ヨシダ時計修理工房</Text>
                        <Text style={styles.shopAddress}>〒104-0061 東京都中央区銀座 1-2-3  TEL: 03-1234-5678</Text>
                    </View>
                </View>

            </View>
        </Page>
    </Document>
);
