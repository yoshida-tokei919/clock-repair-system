import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Register Japanese Font
Font.register({
    family: "NotoSansJP",
    src: "https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8_1v4f5lT8EzlC9FvruPM.ttf",
});

// Dimensions for Brother DK-1209 (Small Address Label): 29mm x 62mm
// 1mm = 2.835pt
// Width: 62mm = 175.7pt -> 176pt
// Height: 29mm = 82.2pt -> 82pt
// We use landscape orientation usually for text flow, or portrait depending on how the tape feeds.
// DK-1209 feeds horizontally? Usually printed as Landscape if text runs long.
// Let's assume Landscape PDF page: 62mm wide, 29mm high.
const styles = StyleSheet.create({
    page: {
        fontFamily: "NotoSansJP",
        flexDirection: 'row',
        backgroundColor: '#fff',
        padding: 4,
        width: 176, // 62mm
        height: 82,  // 29mm
    },
    section: {
        margin: 0,
        padding: 0,
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    leftCol: {
        width: '65%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        paddingRight: 4,
    },
    rightCol: {
        width: '35%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    idText: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    metaText: {
        fontSize: 6,
        color: '#333',
        marginBottom: 1,
    },
    brandText: {
        fontSize: 8,
        fontWeight: 'bold',
    },
    qrCode: {
        width: 50,
        height: 50,
    }
});

export interface TagDocumentProps {
    repairId: string; // e.g., T-101
    modelName: string; // e.g., ROLEX Submariner
    customerName: string;
    qrCodeDataUrl: string; // pre-generated Data URL
}

export const TagDocument = ({ repairId, modelName, customerName, qrCodeDataUrl }: TagDocumentProps) => (
    <Document>
        {/* Page size must be set explicitly for custom label sizes */}
        <Page size={[176, 82]} style={styles.page}>
            <View style={styles.section}>
                <View style={styles.leftCol}>
                    <Text style={styles.idText}>{repairId}</Text>
                    <Text style={styles.brandText}>{modelName}</Text>
                    <Text style={styles.metaText}>{customerName} 様</Text>
                    <Text style={styles.metaText}>{new Date().toLocaleDateString('ja-JP')}</Text>
                </View>
                <View style={styles.rightCol}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={qrCodeDataUrl} style={styles.qrCode} />
                </View>
            </View>
        </Page>
    </Document>
);
