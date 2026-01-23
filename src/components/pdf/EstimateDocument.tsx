import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Register fonts for Japanese Support (Local Noto Sans)
// Reverting to local file because CDN caused "Unknown font format" error.
// The manual trigger will prevent the initial freeze.
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
  // B2B Styles (Compact List)
  // =========================
  b2bContainer: { marginTop: 10, borderTopWidth: 2, borderTopColor: '#333' },
  b2bRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingVertical: 6,
    minHeight: 50,
  },
  b2bLineHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  b2bLineDetail: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 85, marginBottom: 1 }, // Increased padding for alignment

  // B2B Columns (Adjusted for Inquiry No & Ref)
  colNo: { width: '5%', fontSize: 9, fontWeight: 'bold' },
  colInquiry: { width: '12%', fontSize: 9 }, // New Inquiry Column
  colEndUser: { width: '18%', fontSize: 9, fontWeight: 'bold' },
  colWatch: { width: '45%', fontSize: 9 }, // Compressed slightly
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
  b2cWatchInfo: {
    fontSize: 11,
    fontWeight: 'bold',
    flex: 1,
  },
  b2cInquiryNo: {
    fontSize: 10,
    color: '#666',
    marginLeft: 10,
  },
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

interface RepairItem {
  name: string;
  qty: number;
  price: number;
  type?: 'technical' | 'parts' | 'other'; // To distinguish fee types
}

interface RepairJob {
  inquiryId?: string; // New: Inquiry ID (e.g. JK-001)
  partnerRef?: string; // New: Partner Management Number (B2B only)
  watch: {
    brand: string;
    model: string;
    ref?: string; // New: Reference Number
    serial: string;
  };
  endUser?: string; // Added End User Name
  items: RepairItem[];
  photos?: string[];
}

export interface EstimateDocumentProps {
  data: {
    id: string;
    estimateNumber: string;
    date: string;
    customer: {
      name: string;
      type: 'individual' | 'business';
      address?: string;
    };
    jobs: RepairJob[];
  }
}

export function EstimateDocument({ data }: EstimateDocumentProps) {
  const isBusiness = data.customer.type === 'business';

  // Shared Calculations
  const grandTotal = data.jobs.reduce((sum, job) =>
    sum + job.items.reduce((s, item) => s + (item.price * item.qty), 0), 0);
  const tax = grandTotal * 0.1;

  // --------------------------------------------------------------------------
  // Render B2B Page (List Style)
  // --------------------------------------------------------------------------
  if (isBusiness) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <HeaderSection data={data} />

          <View style={styles.b2bContainer}>
            {data.jobs.map((job, idx) => {
              const jobTotal = job.items.reduce((s, item) => s + item.price * item.qty, 0);
              // Format: Brand Model / Ref. XXX / Serial. YYY
              const w = job.watch;
              const watchText = `${w.brand} ${w.model} / Ref. ${w.ref || '-'} / Serial. ${w.serial}`;
              const inquiryText = job.inquiryId || `JK-${String(idx + 1).padStart(3, '0')}`;

              // Only show partner ref if it exists (or ---- if explicitly requested, user said "or ----")
              // User said "貴社管理番号： ---- " if empty to avoid layout shift, or hide.
              // Let's hide if empty for cleaner look, but if user wants alignment, maybe ---- is better.
              // User: "もし入力が空（なし）の場合は、項目名ごと非表示にするか、あるいは『貴社管理番号： ---- 』のように表示して"
              // I will choose to show it if present, or hide if not, but check if user prefers alignment.
              // Actually, user said "prevent layout collapse". So maybe ---- is safer?
              // Let's use `job.partnerRef || '----'`
              const partnerRefText = job.partnerRef ? `貴社管理番号: ${job.partnerRef}` : null;

              return (
                <View key={idx} style={styles.b2bRow}>
                  {/* Line 1: Basic Info */}
                  <View style={styles.b2bLineHeader}>
                    <Text style={styles.colNo}>{idx + 1}</Text>
                    {/* Inquiry No */}
                    <Text style={styles.colInquiry}>{inquiryText}</Text>
                    {/* End User Field */}
                    <Text style={styles.colEndUser}>
                      {job.endUser ? `${job.endUser} 様` : ''}
                    </Text>

                    <Text style={styles.colWatch}>{watchText}</Text>
                    <Text style={styles.colTotal}>¥{jobTotal.toLocaleString()}</Text>
                  </View>

                  {/* Optional Partner Ref Line (Inserted here so it's prominent but doesn't break columns) */}
                  {partnerRefText && (
                    <View style={{ flexDirection: 'row', paddingLeft: 30, marginBottom: 2 }}>
                      <Text style={{ fontSize: 9, color: '#444', backgroundColor: '#eee', paddingHorizontal: 4 }}>{partnerRefText}</Text>
                    </View>
                  )}

                  {/* Line 2+: Detailed Items */}
                  {job.items.map((item, i) => (
                    <View key={i} style={styles.b2bLineDetail}>
                      <Text style={{ width: '60%', fontSize: 8, color: '#555' }}>
                        - {item.name}
                      </Text>
                      <Text style={{ width: '20%', fontSize: 9, textAlign: 'right' }}>
                        ¥{item.price.toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>

          <SummarySection grandTotal={grandTotal} tax={tax} />
        </Page>
      </Document>
    );
  }

  // --------------------------------------------------------------------------
  // Render B2C Page (Individual Style)
  // --------------------------------------------------------------------------
  return (
    <Document>
      {data.jobs.map((job, idx) => {
        const jobTotal = job.items.reduce((s, item) => s + item.price * item.qty, 0);
        const w = job.watch;
        // B2C Watch Info Single Line: Brand Model / Ref. XXX / Serial. YYY
        const watchText = `${w.brand} ${w.model} / Ref. ${w.ref || '-'} / Serial. ${w.serial}`;
        const inquiryText = job.inquiryId || `JK-${String(idx + 1).padStart(3, '0')}`;

        return (
          <Page key={idx} size="A4" style={styles.page}>
            <HeaderSection data={data} />

            <View style={styles.b2cJobContainer}>
              {/* Watch Info Header (B2C) */}
              <View style={styles.b2cHeaderLine}>
                <Text style={styles.b2cWatchInfo}>{watchText}</Text>
                <Text style={styles.b2cInquiryNo}>お問合せNo: {inquiryText}</Text>
              </View>

              {/* Items List */}
              <View style={{ marginTop: 10, marginBottom: 20 }}>
                {job.items.map((item, i) => (
                  <View key={i} style={styles.b2cItemRow}>
                    <Text style={{ fontSize: 10 }}>{item.name}</Text>
                    <Text style={{ fontSize: 10, fontWeight: 'bold' }}>¥{item.price.toLocaleString()}</Text>
                  </View>
                ))}
                {/* Deleted per-job Subtotal row as requested */}
              </View>

              {/* Photos Grid */}
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

            <SummarySection grandTotal={jobTotal} tax={jobTotal * 0.1} />

          </Page>
        );
      })}
    </Document>
  );
}

// -----------------------------------
// Sub-components for Clean Code
// -----------------------------------
const HeaderSection = ({ data }: { data: EstimateDocumentProps['data'] }) => (
  <>
    <View style={styles.header}>
      <Text style={styles.title}>御見積書</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.date}>{data.date}</Text>
        <Text style={{ fontSize: 9, marginTop: 4 }}>見積番号: {data.estimateNumber}</Text>
      </View>
    </View>
    <View style={styles.infoArea}>
      <View>
        <Text style={styles.recipient}>
          {data.customer.name} {data.customer.type === 'business' ? '御中' : '様'}
        </Text>
      </View>
      <View>
        <Text style={styles.sender}>ヨシダ時計修理工房</Text>
        <Text style={styles.sender}>〒104-0061 東京都中央区銀座 1-2-3</Text>
        <Text style={styles.sender}>TEL: 03-1234-5678</Text>
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
      <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>合計</Text>
      <Text style={[styles.summaryValue, { fontWeight: 'bold', fontSize: 12 }]}>¥{(grandTotal + tax).toLocaleString()}</Text>
    </View>
  </View>
);
