import type { Prisma, PrismaClient } from "@prisma/client";
import { parsePhysicalTagIdentifier } from "./physical-tag-resolver";

export type StorageLocationIdentifier =
  | { type: "NFC_UID"; value: string }
  | { type: "QR_TOKEN"; value: string }
  | { type: "SHORT_CODE"; value: string };

export type SelectedStorageLocation = {
  storageLocationId: number;
  name: string;
  locationType: string;
  shortCode: string | null;
};

export type StorageLocationResolveResult =
  | { status: "NOT_FOUND" }
  | ({ status: "INACTIVE" | "RESOLVED" } & SelectedStorageLocation);

export function parseStorageLocationIdentifier(input: unknown): StorageLocationIdentifier {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid identifier");
  const { type, value } = input as Record<string, unknown>;
  if (type !== "NFC_UID" && type !== "QR_TOKEN" && type !== "SHORT_CODE") throw new Error("Invalid identifier");
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid identifier");
  if (type === "NFC_UID") {
    const parsed = parsePhysicalTagIdentifier({ type, value });
    return { type: "NFC_UID", value: parsed.value };
  }
  return { type, value: value.trim() };
}

function identifierWhere(identifier: StorageLocationIdentifier): Prisma.StorageLocationWhereUniqueInput {
  switch (identifier.type) {
    case "NFC_UID": return { nfcUid: identifier.value };
    case "QR_TOKEN": return { qrToken: identifier.value };
    case "SHORT_CODE": return { shortCode: identifier.value };
  }
}

export async function resolveStorageLocation(db: PrismaClient, identifier: StorageLocationIdentifier): Promise<StorageLocationResolveResult> {
  const location = await db.storageLocation.findUnique({
    where: identifierWhere(identifier),
    select: { id: true, name: true, locationType: true, shortCode: true, isActive: true },
  });
  if (!location) return { status: "NOT_FOUND" };
  return {
    status: location.isActive ? "RESOLVED" : "INACTIVE",
    storageLocationId: location.id,
    name: location.name,
    locationType: location.locationType,
    shortCode: location.shortCode,
  };
}
