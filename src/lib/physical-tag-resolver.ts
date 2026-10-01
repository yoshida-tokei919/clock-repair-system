import type { Prisma, PrismaClient } from "@prisma/client";

export type PhysicalTagIdentifier =
  | { type: "NFC_UID"; value: string }
  | { type: "QR_TOKEN"; value: string }
  | { type: "SHORT_CODE"; value: string };

export type PhysicalTagResolveResult =
  | { status: "NOT_FOUND" }
  | { status: "RETIRED"; physicalTagId: number; shortCode: string }
  | { status: "UNASSIGNED"; physicalTagId: number; shortCode: string }
  | {
      status: "RESOLVED";
      physicalTagId: number;
      shortCode: string;
      assignmentId: number;
      assignedAt: Date;
      repairId: number;
      inquiryNumber: string;
      customerId: number;
      repairStatus: string;
    };

export class PhysicalTagIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhysicalTagIdentifierError";
  }
}

const IDENTIFIER_TYPES = new Set(["NFC_UID", "QR_TOKEN", "SHORT_CODE"]);

export function parsePhysicalTagIdentifier(input: unknown): PhysicalTagIdentifier {
  if (!input || typeof input !== "object") {
    throw new PhysicalTagIdentifierError("identifier body is required");
  }

  const { type, value } = input as { type?: unknown; value?: unknown };
  if (typeof type !== "string" || !IDENTIFIER_TYPES.has(type)) {
    throw new PhysicalTagIdentifierError("unsupported identifier type");
  }
  if (typeof value !== "string") {
    throw new PhysicalTagIdentifierError("identifier value must be a string");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new PhysicalTagIdentifierError("identifier value is required");
  }

  if (type !== "NFC_UID") {
    return { type, value: trimmed } as PhysicalTagIdentifier;
  }

  if (!/^[0-9A-Fa-f]{2}(?:[:\- ]?[0-9A-Fa-f]{2})*$/.test(trimmed)) {
    throw new PhysicalTagIdentifierError("NFC UID must contain complete hexadecimal bytes");
  }

  const normalized = trimmed.replace(/[:\- ]/g, "").toUpperCase();
  return { type: "NFC_UID", value: normalized };
}

function identifierWhere(identifier: PhysicalTagIdentifier): Prisma.PhysicalTagWhereUniqueInput {
  switch (identifier.type) {
    case "NFC_UID":
      return { nfcUid: identifier.value };
    case "QR_TOKEN":
      return { qrToken: identifier.value };
    case "SHORT_CODE":
      return { shortCode: identifier.value };
  }
}

export async function resolvePhysicalTag(
  db: PrismaClient,
  identifier: PhysicalTagIdentifier,
): Promise<PhysicalTagResolveResult> {
  const tag = await db.physicalTag.findUnique({
    where: identifierWhere(identifier),
    select: {
      id: true,
      shortCode: true,
      status: true,
      assignments: {
        where: { releasedAt: null },
        take: 1,
        select: {
          id: true,
          assignedAt: true,
          repair: {
            select: {
              id: true,
              inquiryNumber: true,
              customerId: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!tag) return { status: "NOT_FOUND" };
  const base = { physicalTagId: tag.id, shortCode: tag.shortCode };

  if (tag.status === "RETIRED") {
    return { status: "RETIRED", ...base };
  }

  const assignment = tag.assignments[0];
  if (!assignment) {
    return { status: "UNASSIGNED", ...base };
  }

  return {
    status: "RESOLVED",
    ...base,
    assignmentId: assignment.id,
    assignedAt: assignment.assignedAt,
    repairId: assignment.repair.id,
    inquiryNumber: assignment.repair.inquiryNumber,
    customerId: assignment.repair.customerId,
    repairStatus: assignment.repair.status,
  };
}
