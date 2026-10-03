export type PhysicalTagLabel = {
  shortCode: string;
  inquiryNumber: string;
  customerType: "individual" | "business";
  customerName: string;
  endUserName: string | null;
  partnerRef: string | null;
  brand: string;
  model: string;
  reference: string;
  serialNumber: string | null;
  caliber: string | null;
  receptionDate: string | null;
  qrPayload: string;
};

type LabelInput = Omit<PhysicalTagLabel, "qrPayload" | "customerName" | "caliber"> & {
  qrToken: string;
  customerName: string;
  companyName: string | null;
  movementCaliber: string | null;
  watchCaliber: string | null;
};

export function physicalTagLabel(input: LabelInput): PhysicalTagLabel {
  const { qrToken, companyName, movementCaliber, watchCaliber, ...display } = input;
  return {
    ...display,
    customerName: input.customerType === "business"
      ? companyName?.trim() || input.customerName
      : input.customerName,
    endUserName: input.customerType === "business" ? input.endUserName?.trim() || null : null,
    partnerRef: input.customerType === "business" ? input.partnerRef?.trim() || null : null,
    caliber: movementCaliber?.trim() || watchCaliber?.trim() || null,
    qrPayload: qrToken,
  };
}
