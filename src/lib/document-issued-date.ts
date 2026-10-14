/** Document issue dates are calendar dates in Japan, stored at JST midnight. */
export function formatIssuedDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find(row => row.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parseIssuedDate(value: unknown): Date {
  if (typeof value !== "string" || !/^(\d{4})-(\d{2})-(\d{2})$/.test(value)) {
    throw new Error("発行日はYYYY-MM-DD形式で指定してください");
  }
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || year > 9998 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("有効な発行日を指定してください");
  }
  const date = new Date(Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000);
  if (formatIssuedDate(date) !== value) throw new Error("有効な発行日を指定してください");
  return date;
}

export function todayIssuedDate(now = new Date()): Date {
  return parseIssuedDate(formatIssuedDate(now));
}

export function resolveIssuedDate(input: string | undefined, now = new Date()): Date {
  return input === undefined ? todayIssuedDate(now) : parseIssuedDate(input);
}

export function displayIssuedDate(date: Date): string {
  return formatIssuedDate(date).replaceAll("-", "/");
}

export function canChangeDeliveryIssuedDate(hasInvoiceSnapshot: boolean, hasLinkedInvoice: boolean) {
  return !hasInvoiceSnapshot && !hasLinkedInvoice;
}

export function canChangeUnrenderedIssuedDate(hasCurrentPdf: boolean) {
  return !hasCurrentPdf;
}

export function canChangeInvoiceIssuedDate(status: string, lineSendStarted: boolean, unresolvedOutbox: boolean) {
  return ["issued", "paid"].includes(status) && !lineSendStarted && !unresolvedOutbox;
}
