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

function requiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

export function parseReturnAddress(value: unknown): ReturnAddress {
  if (!value || typeof value !== "object") throw new Error("返送先を入力してください。");
  const address = value as ReturnAddressInput;
  const postalCode = normalizePostalCode(address.postalCode);
  if (!postalCode) throw new Error("郵便番号は7桁で入力してください。");

  return {
    recipientName: requiredText(address.recipientName, "お名前を入力してください。"),
    postalCode,
    prefecture: requiredText(address.prefecture, "都道府県を入力してください。"),
    city: requiredText(address.city, "市区町村を入力してください。"),
    street: requiredText(address.street, "町名・番地を入力してください。"),
    building: typeof address.building === "string" && address.building.trim() ? address.building.trim() : null,
    phone: requiredText(address.phone, "電話番号を入力してください。"),
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

export function returnAddressResponse(address: ReturnAddress) {
  return {
    recipientName: address.recipientName,
    postalCode: address.postalCode,
    prefecture: address.prefecture,
    city: address.city,
    street: address.street,
    building: address.building ?? "",
    phone: address.phone,
  };
}

export function pendingReturnAddressUpdateWhere(repairId: number) {
  return { id: repairId, approvalStatus: "pending" };
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
