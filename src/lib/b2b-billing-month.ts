const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parseBillingMonth(value: unknown) {
  if (typeof value !== "string") return null;
  const match = MONTH_PATTERN.exec(value);
  if (!match || Number(match[1]) < 1000 || Number(match[1]) > 9998) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function billingMonthBounds(value: string) {
  const parsed = parseBillingMonth(value);
  if (!parsed) throw new Error("対象月はYYYY-MM形式で指定してください");
  const { year, month } = parsed;
  // Japan has no daylight saving time. These instants bound local calendar days.
  return {
    from: new Date(Date.UTC(year, month - 1, 1) - 9 * 60 * 60 * 1000),
    to: new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000),
  };
}

export function b2bPaymentDueDate(value: string) {
  const parsed = parseBillingMonth(value);
  if (!parsed) throw new Error("対象月はYYYY-MM形式で指定してください");
  // Invoice due dates use UTC midnight as a calendar date, like B2C invoices.
  return new Date(Date.UTC(parsed.year, parsed.month + 1, 0));
}

export function billingMonthFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
  }).formatToParts(date);
  return `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
}

export function isB2BBillingRepairEligible(
  repair: { customerId: number; invoiceId: number | null; deliveryNote: { customerId: number; issuedDate: Date } | null },
  customerId: number,
  bounds: { from: Date; to: Date },
) {
  return repair.customerId === customerId && repair.invoiceId === null
    && repair.deliveryNote?.customerId === customerId
    && repair.deliveryNote.issuedDate >= bounds.from && repair.deliveryNote.issuedDate < bounds.to;
}
