export interface EstimateServerDocumentProps {
  data: {
    estimateNumber: string;
    date: string;
    customer: { name: string; address?: string };
    jobs: {
      id: string;
      inquiryNumber: string;
      partnerRef?: string;
      endUserName?: string;
      customerNote?: string;
      watch: { brand: string; model: string; ref?: string; serial?: string };
      items: {
        name: string;
        price: number;
        type?: string;
        grade?: string;
        note2?: string;
        displayName?: string;
      }[];
    }[];
  };
}

export function createEstimateServerDocumentElement(
  ReactRuntime: any,
  renderer: any,
  data: EstimateServerDocumentProps["data"]
) {
  const { Document, Page, StyleSheet, Text, View } = renderer;
  const el = ReactRuntime.createElement;

  const styles = StyleSheet.create({
    page: {
      padding: 30,
      fontFamily: "Noto Sans JP",
      fontSize: 10,
      color: "#333",
    },
    header: {
      marginBottom: 20,
      borderBottomWidth: 1,
      borderColor: "#333",
      paddingBottom: 6,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    title: { fontSize: 18, fontWeight: "bold" },
    sender: { fontSize: 9, textAlign: "right", lineHeight: 1.4 },
    infoArea: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    recipient: {
      fontSize: 12,
      borderBottomWidth: 1,
      borderColor: "#ccc",
      paddingBottom: 3,
    },
    table: {
      borderTopWidth: 2,
      borderColor: "#333",
    },
    row: {
      borderBottomWidth: 1,
      borderColor: "#ccc",
      paddingVertical: 6,
    },
    mainRow: {
      flexDirection: "row",
    },
    small: { fontSize: 8 },
    itemRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    note: {
      marginTop: 4,
      backgroundColor: "#f5f7fa",
      padding: 4,
      fontSize: 8,
      color: "#333",
    },
    footer: {
      marginTop: 20,
      borderTopWidth: 1,
      borderColor: "#ccc",
      paddingTop: 10,
      fontSize: 9,
    },
  });

  return el(
    Document,
    null,
    el(
      Page,
      { size: "A4", style: styles.page },
      el(
        View,
        { style: styles.header },
        el(Text, { style: styles.title }, "御見積書"),
        el(View, null, el(Text, null, `発行日: ${data.date}`), el(Text, null, `No. ${data.estimateNumber}`))
      ),
      el(
        View,
        { style: styles.infoArea },
        el(
          View,
          { style: { width: "55%" } },
          el(Text, { style: styles.recipient }, `${data.customer.name} 御中`),
          el(Text, { style: { marginTop: 4 } }, data.customer.address || ""),
          el(Text, { style: { marginTop: 10 } }, "下記の通りお見積申し上げます。")
        ),
        el(
          View,
          { style: { width: "40%" } },
          el(Text, { style: styles.sender }, "ヨシダ時計修理工房"),
          el(Text, { style: styles.sender }, "〒651-1213 神戸市北区広陵町1-162-1-401"),
          el(Text, { style: styles.sender }, "TEL: 090-2041-8275")
        )
      ),
      el(
        View,
        { style: styles.table },
        data.jobs.map((job, index) => {
          const jobTotal = job.items.reduce((sum, item) => sum + item.price, 0);
          const watchInfo = [
            job.watch.brand,
            job.watch.model,
            job.watch.ref ? `Ref: ${job.watch.ref}` : null,
            job.watch.serial ? `Ser: ${job.watch.serial}` : null,
          ]
            .filter(Boolean)
            .join("\n");

          return el(
            View,
            { key: job.id || index, style: styles.row },
            el(
              View,
              { style: styles.mainRow },
              el(Text, { style: [styles.small, { width: "4%" }] }, String(index + 1)),
              el(Text, { style: [styles.small, { width: "12%" }] }, job.inquiryNumber),
              el(Text, { style: [styles.small, { width: "13%" }] }, job.partnerRef || "-"),
              el(Text, { style: [styles.small, { width: "13%" }] }, job.endUserName || "-"),
              el(Text, { style: [styles.small, { width: "22%" }] }, watchInfo),
              el(
                View,
                { style: { width: "26%" } },
                job.items.map((item, itemIndex) =>
                  el(
                    View,
                    { key: itemIndex, style: styles.itemRow },
                    el(
                      Text,
                      { style: { width: "72%", fontSize: 8 } },
                      `・${item.displayName || item.name}`
                    ),
                    el(
                      Text,
                      { style: { width: "28%", textAlign: "right", fontSize: 8 } },
                      `¥${item.price.toLocaleString()}`
                    )
                  )
                )
              ),
              el(
                Text,
                { style: { width: "10%", textAlign: "right" } },
                `¥${jobTotal.toLocaleString()}`
              )
            ),
            job.customerNote
              ? el(Text, { style: styles.note }, `ご連絡事項: ${job.customerNote}`)
              : null
          );
        })
      ),
      el(
        Text,
        { style: styles.footer },
        "※ 部品の在庫状況により納期が変動する場合がございます。"
      )
    )
  );
}
