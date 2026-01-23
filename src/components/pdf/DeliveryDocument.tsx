import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font, Image } from '@react-pdf/renderer';

Font.register({
    family: 'Noto Sans JP',
    src: '/fonts/NotoSansJP-Regular.otf',

});

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: 'Noto Sans JP',
        fontSize: 10,
        color: '#333',
        backgroundColor: '#fff',
    },

    // =========================
    // Shared Header
    // =========================
    header: {
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        paddingBottom: 5,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    title: { fontSize: 18, fontWeight: 'bold' },
    date: { fontSize: 10 },

    infoArea: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    recipient: { fontSize: 12, borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 2 },
    sender: { fontSize: 9, textAlign: 'right', lineHeight: 1.3 },

    // =========================
    // B2B Styles (Compact List) - Copied from EstimateDocument
    // =========================
    b2bContainer: { marginTop: 10, borderTopWidth: 2, borderTopColor: '#333' },
    b2bRow: {
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        paddingVertical: 6,
        minHeight: 50,
    },
    b2bLineHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    b2bLineDetail: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 85, marginBottom: 1 },

    // B2B Columns
    colNo: { width: '5%', fontSize: 9, fontWeight: 'bold' },
    colInquiry: { width: '12%', fontSize: 9 },
    colEndUser: { width: '18%', fontSize: 9, fontWeight: 'bold' },
    colWatch: { width: '45%', fontSize: 9 },
    colTotal: { width: '20%', fontSize: 10, textAlign: 'right', fontWeight: 'bold' },

    // =========================
    // B2C Styles (Spacious w/ Photos)
    // =========================
    b2cJobContainer: { marginBottom: 20 },
    b2cHeaderLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: 8,
        marginBottom: 10,
        marginTop: 10,
    },
    b2cWatchInfo: { fontSize: 11, fontWeight: 'bold', flex: 1 },
    b2cInquiryNo: { fontSize: 10, color: '#666', marginLeft: 10 },
    b2cItemRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 8 },
    photoContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
    photo: { width: 150, height: 100, objectFit: 'cover', borderRadius: 4, backgroundColor: '#eee' },

    // =========================
    // Summary Area
    // =========================
    summaryArea: { marginTop: 20, alignItems: 'flex-end' },
    summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', width: '50%', marginBottom: 3 },
    summaryLabel: { width: '40%', textAlign: 'right', marginRight: 10, fontSize: 9 },
    summaryValue: { width: '30%', textAlign: 'right', fontSize: 10 },
    grandTotal: { borderTopWidth: 2, borderTopColor: '#333', paddingTop: 4, fontWeight: 'bold' }
});

export interface DeliveryDocumentProps {
    data: {
        id: string; // inquiryNumber
        deliveryNumber: string; // 正規の伝票番号
        date: string;
        customer: { name: string; type: 'individual' | 'business'; address?: string; };
        jobs: {
            inquiryId?: string;
            partnerRef?: string;
            endUser?: string;
            watch: { brand: string; model: string; ref?: string; serial: string; };
            items: { name: string; qty: number; price: number; }[];
            photos?: string[];
        }[];
        discount: number;
        shipping: number;
    }
}

export function DeliveryDocument({ data }: DeliveryDocumentProps) {
    const isBusiness = data.customer.type === 'business';

    const rawTotal = data.jobs.reduce((sum, job) => sum + job.items.reduce((s, item) => s + (item.price * item.qty), 0), 0);
    const discount = data.discount || 0;
    const shipping = data.shipping || 0;

    const taxableAmount = rawTotal - discount;
    const tax = Math.floor(taxableAmount * 0.1);
    const grandTotal = Math.floor(taxableAmount * 1.1) + shipping;

    const HeaderSection = () => (
        <>
            <View style={styles.header}>
                <Text style={styles.title}>納品書</Text>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.date}>{data.date}</Text>
                    <Text style={{ fontSize: 9, marginTop: 4 }}>伝票番号: {data.deliveryNumber}</Text>
                </View>
            </View>
            <View style={styles.infoArea}>
                <View>
                    <Text style={styles.recipient}>{data.customer.name} {isBusiness ? '御中' : '様'}</Text>
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

    const SummarySection = () => (
        <View style={styles.summaryArea}>
            <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>小計</Text>
                <Text style={styles.summaryValue}>¥{rawTotal.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>値引き</Text>
                <Text style={styles.summaryValue}>-¥{discount.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>消費税 (10%)</Text>
                <Text style={styles.summaryValue}>¥{tax.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>送料</Text>
                <Text style={styles.summaryValue}>¥{shipping.toLocaleString()}</Text>
            </View>
            <View style={[styles.summaryRow, styles.grandTotal]}>
                <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>合計金額</Text>
                <Text style={[styles.summaryValue, { fontWeight: 'bold', fontSize: 12 }]}>¥{grandTotal.toLocaleString()}</Text>
            </View>
        </View>
    );

    // ==========================================
    // B2B Layout (List Style)
    // ==========================================
    if (isBusiness) {
        return (
            <Document>
                <Page size="A4" style={styles.page}>
                    <HeaderSection />

                    <View style={styles.b2bContainer}>
                        {/* Header Row */}
                        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 4, marginBottom: 4 }}>
                            <Text style={styles.colNo}>No.</Text>
                            <Text style={styles.colInquiry}>管理番号</Text>
                            <Text style={styles.colEndUser}>お客様名</Text>
                            <Text style={styles.colWatch}>時計情報 / 作業内容</Text>
                            <Text style={styles.colTotal}>金額(税抜)</Text>
                        </View>

                        {data.jobs.map((job, idx) => {
                            const jobTotal = job.items.reduce((s, item) => s + item.price * item.qty, 0);
                            const w = job.watch;
                            const watchText = [w.brand, w.model, w.ref ? `Ref.${w.ref}` : null, w.serial ? `Ser.${w.serial}` : null].filter(Boolean).join(' / ');
                            const inquiryText = job.inquiryId || '-';
                            const partnerRefText = job.partnerRef ? `貴社管理番号: ${job.partnerRef}` : '';

                            return (
                                <View key={idx} style={styles.b2bRow}>
                                    {/* Line 1: Main Columns */}
                                    <View style={styles.b2bLineHeader}>
                                        <Text style={styles.colNo}>{idx + 1}</Text>
                                        <Text style={styles.colInquiry}>{inquiryText}</Text>
                                        <Text style={styles.colEndUser}>{job.endUser ? `${job.endUser} 様` : ''}</Text>
                                        <Text style={styles.colWatch}>{watchText}</Text>
                                        <Text style={styles.colTotal}>¥{jobTotal.toLocaleString()}</Text>
                                    </View>

                                    {/* Partner Ref */}
                                    {partnerRefText && (
                                        <View style={{ flexDirection: 'row', paddingLeft: 85, marginBottom: 4 }}>
                                            <Text style={{ fontSize: 9, backgroundColor: '#eee', paddingHorizontal: 4, color: '#444' }}>{partnerRefText}</Text>
                                        </View>
                                    )}

                                    {/* Line 2+: Details (Indented) */}
                                    {job.items.map((item, i) => (
                                        <View key={i} style={styles.b2bLineDetail}>
                                            <Text style={{ width: '60%', fontSize: 8, color: '#555' }}>- {item.name}</Text>
                                            <Text style={{ width: '20%', fontSize: 9, textAlign: 'right', color: '#555' }}>¥{item.price.toLocaleString()}</Text>
                                        </View>
                                    ))}
                                </View>
                            );
                        })}
                    </View>

                    <SummarySection />
                </Page>
            </Document>
        );
    }

    // ==========================================
    // B2C Layout (Individual Style)
    // ==========================================
    return (
        <Document>
            {(data.jobs || []).map((job, idx) => {
                const w = job.watch;
                // B2C Watch Info Single Line: Brand Model / Ref. XXX / Serial. YYY
                const watchText = [w.brand, w.model, w.ref ? `Ref. ${w.ref}` : null, w.serial ? `Serial. ${w.serial}` : null].filter(Boolean).join(' / ');
                const inquiryText = job.inquiryId || '-';

                return (
                    <Page key={idx} size="A4" style={styles.page}>
                        <HeaderSection />
                        <View style={styles.b2cJobContainer}>
                            <Text style={{ fontSize: 10, marginBottom: 10 }}>
                                毎度ご利用いただき、誠にありがとうございます。
                                以下の通りご請求申し上げます。
                            </Text>
                            <View style={styles.b2cHeaderLine}>
                                <Text style={styles.b2cWatchInfo}>{watchText}</Text>
                                <Text style={styles.b2cInquiryNo}>お問合せNo: {inquiryText}</Text>
                            </View>
                            <View style={{ marginTop: 10, marginBottom: 20 }}>
                                {job.items.map((item, i) => (
                                    <View key={i} style={styles.b2cItemRow}>
                                        <Text style={{ fontSize: 10 }}>{item.name}</Text>
                                        <Text style={{ fontSize: 10, fontWeight: 'bold' }}>¥{item.price.toLocaleString()}</Text>
                                    </View>
                                ))}
                            </View>
                            {job.photos && job.photos.length > 0 && (
                                <View>
                                    <Text style={{ fontSize: 10, marginBottom: 5, color: '#666' }}>お預かり時コンディション:</Text>
                                    <View style={styles.photoContainer}>
                                        {job.photos.map((url, pIdx) => (
                                            <Image key={pIdx} src={url} style={styles.photo} />
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>
                        <SummarySection />
                    </Page>
                );
            })}
        </Document>
    );
}
