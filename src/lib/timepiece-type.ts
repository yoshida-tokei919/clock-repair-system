import type { TimepieceType } from "@prisma/client";

export const TIMEPIECE_TYPE_MAX_LENGTH = 100;
export const TIMEPIECE_TYPE_CHOICES = ["掛時計", "置時計", "懐中時計", "ホールクロック"] as const;
export class TimepieceTypeError extends Error {}

export function parseTimepieceType(value: unknown): { timepieceType: TimepieceType; timepieceTypeLabel: string | null } {
  if (value == null || value === "") return { timepieceType: "WRISTWATCH", timepieceTypeLabel: null };
  if (typeof value !== "string") throw new TimepieceTypeError("時計の種類の形式が不正です。");
  const label = value.trim();
  if (label.length > TIMEPIECE_TYPE_MAX_LENGTH) throw new TimepieceTypeError(`時計の種類は${TIMEPIECE_TYPE_MAX_LENGTH}文字以内で入力してください。`);
  if (!label) return { timepieceType: "WRISTWATCH", timepieceTypeLabel: null };
  if (label === "掛時計") return { timepieceType: "WALL_CLOCK", timepieceTypeLabel: null };
  if (label === "置時計") return { timepieceType: "TABLE_CLOCK", timepieceTypeLabel: null };
  if (label === "懐中時計") return { timepieceType: "POCKET_WATCH", timepieceTypeLabel: null };
  return { timepieceType: "OTHER", timepieceTypeLabel: label };
}

// A create request may reuse a Watch identified by brand and serial.
// Leaving the operator field blank must not change that Watch's existing classification.
export function timepieceTypeUpdateForCreateReuse(value: unknown): Partial<ReturnType<typeof parseTimepieceType>> {
  if (value == null || (typeof value === "string" && !value.trim())) return {};
  return parseTimepieceType(value);
}

export function timepieceTypeInputValue(watch: { timepieceType?: TimepieceType | null; timepieceTypeLabel?: string | null }): string {
  switch (watch.timepieceType) {
    case "WALL_CLOCK": return "掛時計";
    case "TABLE_CLOCK": return "置時計";
    case "POCKET_WATCH": return "懐中時計";
    case "OTHER": return watch.timepieceTypeLabel ?? "その他の時計";
    default: return "";
  }
}

export function timepieceTypePrefix(watch: { timepieceType?: TimepieceType | null; timepieceTypeLabel?: string | null }): string {
  return timepieceTypeInputValue(watch);
}

type WatchInformation = { brand?: string | null; model?: string | null; ref?: string | null; serial?: string | null; timepieceType?: TimepieceType | null; timepieceTypeLabel?: string | null };

export function formatWatchHeading(watch: WatchInformation): string {
  const type = timepieceTypePrefix(watch);
  const name = [watch.brand, watch.model].filter(Boolean).join(" ");
  return type ? [type, name].filter(Boolean).join(" / ") : name;
}

export function formatWarrantyIdentifiers(watch: Pick<WatchInformation, "ref" | "serial">): string {
  return [watch.ref?.trim(), watch.serial?.trim()].filter(Boolean).join(" / ");
}

export function formatWatchInformation(watch: WatchInformation, style: "estimate" | "delivery" | "invoice" = "invoice"): string {
  const ref = watch.ref?.trim();
  const serial = watch.serial?.trim();
  if (style === "estimate") {
    const type = timepieceTypePrefix(watch);
    const brand = [type, watch.brand].filter(Boolean).join(" / ");
    return [brand, watch.model, ref && `Ref: ${ref}`, serial && `Ser: ${serial}`].filter(Boolean).join("\n");
  }
  if (style === "delivery") {
    const identifiers = [ref && `Ref: ${ref}`, serial && `Ser: ${serial}`].filter(Boolean).join(" / ");
    return [formatWatchHeading(watch), identifiers].filter(Boolean).join("\n");
  }
  return [formatWatchHeading(watch), ref && `Ref: ${ref}`, serial && `Serial: ${serial}`].filter(Boolean).join("\n");
}
