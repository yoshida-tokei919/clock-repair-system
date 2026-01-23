import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
    family: 'Noto Sans JP',
    src: '/fonts/NotoSansJP-Regular.otf',

});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Noto Sans JP', fontSize: 10, color: '#333' },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 5 },
    title: { fontSize: 18, fontWeight: 'bold' },
    timestamp: { fontSize: 9, color: '#666' },

    // Group
    groupContainer: { marginBottom: 15 },
    groupTitle: { fontSize: 12, fontWeight: 'bold', backgroundColor: '#eee', padding: 4, marginBottom: 5 },

    // Row
    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 4, alignItems: 'center' },

    // Columns
    colId: { width: '10%' },
    colCustomer: { width: '25%' },
    colWatch: { width: '35%' },
    colDate: { width: '15%', fontSize: 9 },
    colDue: { width: '15%', fontSize: 9, fontWeight: 'bold', color: '#c00' },
});

interface StatusItem {
    id: string;
    customerName: string;
    watchInfo: string;
    startDate: string;
    dueDate: string;
}

export interface StatusDocumentProps {
    data: {
        generatedAt: string;
        groups: {
            status: string; // e.g. "Diagnosing", "Repairing"
            count: number;
            items: StatusItem[];
        }[];
    }
}

export function StatusDocument({ data }: StatusDocumentProps) {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <Text style={styles.title}>修理進行状況レポート (WIP Status)</Text>
                    <Text style={styles.timestamp}>作成日時: {data.generatedAt}</Text>
                </View>

                {data.groups.map((group, idx) => (
                    <View key={idx} style={styles.groupContainer}>
                        <Text style={styles.groupTitle}>
                            {group.status} ({group.count}件)
                        </Text>
                        {group.items.map((item, i) => (
                            <View key={i} style={styles.row}>
                                <Text style={styles.colId}>{item.id}</Text>
                                <Text style={styles.colCustomer}>{item.customerName}</Text>
                                <Text style={styles.colWatch}>{item.watchInfo}</Text>
                                <Text style={styles.colDate}>{item.startDate} 受付</Text>
                                <Text style={styles.colDue}>納期: {item.dueDate}</Text>
                            </View>
                        ))}
                    </View>
                ))}
            </Page>
        </Document>
    );
}
