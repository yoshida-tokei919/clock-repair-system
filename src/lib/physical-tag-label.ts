export type PhysicalTagLabel = {
  shortCode: string;
  inquiryNumber: string;
  customerName: string;
  brand: string;
  model: string;
  reference: string;
  receptionDate: string | null;
  qrPayload: string;
};

export function physicalTagLabel(input: Omit<PhysicalTagLabel, "qrPayload"> & { qrToken: string }): PhysicalTagLabel {
  const { qrToken, ...display } = input;
  return { ...display, qrPayload: qrToken };
}
