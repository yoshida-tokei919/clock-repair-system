export type PublicShipmentView = {
  id: number;
  label: string;
  detail: string;
  trackingNumber: string | null;
  actualShippedAt: Date | null;
  deliveredAt: Date | null;
  inquiryNumbers: string[];
};

type RepairWithShipments = {
  inquiryNumber?: string | null;
  shipmentRepairs?: Array<{
    shipment: {
      id: number;
      direction: string;
      status: string;
      carrierCode: string | null;
      trackingNumber: string | null;
      actualShippedAt: Date | null;
      deliveredAt: Date | null;
    };
  }>;
};

const statusText: Readonly<Record<string, { label: string; detail: string }>> = {
  LABEL_ISSUED: { label: "発送準備中", detail: "送り状を発行し、郵便局への引き渡しを準備しています。" },
  AWAITING_ACCEPTANCE: { label: "発送準備中", detail: "郵便局での引受を待っています。" },
  SHIPPED: { label: "発送済み", detail: "郵便局で引受が完了しました。" },
  IN_TRANSIT: { label: "輸送中", detail: "お届け先へ輸送中です。" },
  OUT_FOR_DELIVERY: { label: "配達中", detail: "配達を担当する郵便局から持ち出されています。" },
  DELIVERED: { label: "配達完了", detail: "配達が完了しました。" },
  EXCEPTION: { label: "配送状況を確認中", detail: "通常と異なる配送状態です。必要に応じて当店からご案内します。" },
};

export function publicShipmentViews(repairs: RepairWithShipments[]): PublicShipmentView[] {
  const views = new Map<number, PublicShipmentView>();
  for (const repair of repairs) {
    for (const link of repair.shipmentRepairs ?? []) {
      const shipment = link.shipment;
      const text = statusText[shipment.status];
      if (!text || shipment.direction !== "OUTBOUND" || shipment.carrierCode !== "JAPAN_POST") continue;
      const inquiryNumber = repair.inquiryNumber?.trim() || "";
      const existing = views.get(shipment.id);
      if (existing) {
        if (inquiryNumber && !existing.inquiryNumbers.includes(inquiryNumber)) existing.inquiryNumbers.push(inquiryNumber);
        continue;
      }
      views.set(shipment.id, {
        id: shipment.id,
        ...text,
        trackingNumber: /^\d{12}$/.test(shipment.trackingNumber ?? "") ? shipment.trackingNumber : null,
        actualShippedAt: shipment.actualShippedAt,
        deliveredAt: shipment.deliveredAt,
        inquiryNumbers: inquiryNumber ? [inquiryNumber] : [],
      });
    }
  }
  return [...views.values()].sort((a, b) => a.id - b.id);
}
