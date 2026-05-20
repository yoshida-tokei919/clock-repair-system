export interface EstimateServerDocumentProps {
  data: {
    estimateNumber: string;
    date: string;
    customer: { name: string; address?: string; type?: string };
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
  const stripHonorific = (value: string) => value.trim().replace(/\s*(御中|様)$/, "").trim();
  const withOnchu = (value: string) => {
    const name = stripHonorific(value);
    return name ? `${name} 御中` : "御中";
  };
  const withSama = (value?: string) => {
    const name = stripHonorific(value || "");
    return name ? `${name} 様` : "-";
  };
  const withCustomerHonorific = (value: string, customerType?: string) =>
    customerType === "business" ? withOnchu(value) : withSama(value);

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
    tableHeader: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderColor: "#000",
      paddingBottom: 4,
      marginBottom: 4,
      alignItems: "flex-end",
    },
    row: {
      borderBottomWidth: 1,
      borderColor: "#ccc",
      paddingVertical: 4,
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
          el(Text, { style: styles.recipient }, withCustomerHonorific(data.customer.name, data.customer.type)),
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
        // 保存済み見積PDFは管理画面・B2B共有・LINE共有後のPDFで共通利用するため、
        // 表ヘッダーは削除しない。
        el(
          View,
          { style: styles.tableHeader },
          el(Text, { wrap: false, style: [styles.small, { width: "2.5%", fontWeight: "bold" }] }, "No."),
          el(Text, { wrap: false, style: [styles.small, { width: "6.5%" }] }, "管理No"),
          el(Text, { wrap: false, style: [styles.small, { width: "8.5%" }] }, "貴社管理No"),
          el(Text, { wrap: false, style: [styles.small, { width: "9%", textAlign: "right", paddingRight: 5 }] }, "顧客名"),
          el(Text, { wrap: false, style: [styles.small, { width: "20.5%", textAlign: "right", paddingRight: 2, fontWeight: "bold" }] }, "時計情報"),
          el(Text, { wrap: false, style: { width: "44%", fontSize: 9, borderLeftWidth: 1, borderColor: "#ccc", paddingLeft: 0, marginLeft: 1 } }, "作業明細・交換部品 / 単価"),
          el(Text, { style: { width: "10%", textAlign: "right", fontSize: 10, fontWeight: "bold" } }, "小計(税抜)")
        ),
        data.jobs.map((job, index) => {
          const jobTotal = job.items.reduce((sum, item) => sum + item.price, 0);
          const watchInfo = `${job.watch.brand}\n${job.watch.model}\nRef: ${
            job.watch.ref || "-"
          }\nSer: ${job.watch.serial || "-"}`;

          return el(
            View,
            { key: job.id || index, style: [styles.row, { minHeight: 30 }] },
            el(
              View,
              { style: styles.mainRow },
              el(Text, { style: [styles.small, { width: "2.5%", fontWeight: "bold" }] }, String(index + 1)),
              el(Text, { style: [styles.small, { width: "6.5%" }] }, job.inquiryNumber),
              el(Text, { style: [styles.small, { width: "8.5%" }] }, job.partnerRef || "-"),
              el(Text, { style: [styles.small, { width: "9%", textAlign: "right", paddingRight: 5 }] }, withSama(job.endUserName)),
              el(Text, { style: [styles.small, { width: "20.5%", textAlign: "right", paddingRight: 2, fontWeight: "bold" }] }, watchInfo),
              el(
                View,
                { style: { width: "44%", paddingLeft: 0, borderLeftWidth: 1, borderColor: "#eee" } },
                job.items.map((item, itemIndex) =>
                  el(
                    View,
                    { key: itemIndex, style: styles.itemRow },
                    el(
                      Text,
                      { style: { width: "78%", fontSize: 7 } },
                      `・${item.displayName || item.name}`
                    ),
                    el(
                      Text,
                      { style: { width: "22%", textAlign: "right", fontSize: 7 } },
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
