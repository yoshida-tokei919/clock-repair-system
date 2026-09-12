import { normalizePostalCode } from "@/lib/repair-intake";

export type ReturnAddressInput = {
  recipientName?: unknown;
  postalCode?: unknown;
  prefecture?: unknown;
  city?: unknown;
  street?: unknown;
  building?: unknown;
  phone?: unknown;
};

export type ReturnAddress = {
  recipientName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  building: string | null;
  phone: string;
};

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function parseReturnAddress(value: unknown): ReturnAddress {
  if (!value || typeof value !== "object") throw new Error("Return address is required.");
  const address = value as ReturnAddressInput;
  const postalCode = normalizePostalCode(address.postalCode);
  if (!postalCode) throw new Error("Postal code must be seven digits.");

  return {
    recipientName: requiredText(address.recipientName, "Recipient name"),
    postalCode,
    prefecture: requiredText(address.prefecture, "Prefecture"),
    city: requiredText(address.city, "City"),
    street: requiredText(address.street, "Street"),
    building: typeof address.building === "string" && address.building.trim() ? address.building.trim() : null,
    phone: requiredText(address.phone, "Phone"),
  };
}

export function returnAddressData(address: ReturnAddress) {
  return {
    returnRecipientName: address.recipientName,
    returnPostalCode: address.postalCode,
    returnPrefecture: address.prefecture,
    returnCity: address.city,
    returnStreet: address.street,
    returnBuilding: address.building,
    returnPhone: address.phone,
  };
}

export function parseRepairReturnAddress(repair: {
  returnRecipientName: string | null;
  returnPostalCode: string | null;
  returnPrefecture: string | null;
  returnCity: string | null;
  returnStreet: string | null;
  returnBuilding: string | null;
  returnPhone: string | null;
}) {
  return parseReturnAddress({
    recipientName: repair.returnRecipientName,
    postalCode: repair.returnPostalCode,
    prefecture: repair.returnPrefecture,
    city: repair.returnCity,
    street: repair.returnStreet,
    building: repair.returnBuilding,
    phone: repair.returnPhone,
  });
}

export function assertApprovalReturnAddress(
  customerType: string,
  repair: Parameters<typeof parseRepairReturnAddress>[0],
) {
  if (customerType === "individual") parseRepairReturnAddress(repair);
}
