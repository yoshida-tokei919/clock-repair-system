import crypto from "node:crypto";

import { BrandKind, Prisma, TimepieceType, WatchDriveType, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const REPAIR_INTAKE_STATUS = "送付待ち";
export const REPAIR_INTAKE_INVITE_TTL_DAYS = 7;
const INTAKE_TOKEN_BYTES = 32;

type DbClient = PrismaClient | Prisma.TransactionClient;

export class RepairIntakeError extends Error {
  constructor(
    public readonly code: "INVALID_TOKEN" | "EXPIRED_TOKEN" | "USED_TOKEN" | "INVALID_INPUT" | "INVALID_BRAND" | "CUSTOMER_NOT_FOUND" | "B2B_CUSTOMER" | "LINE_USER_NOT_FOUND" | "LINE_USER_ALREADY_LINKED",
    message: string,
  ) {
    super(message);
  }
}

export type RepairIntakeCustomerInput = {
  name?: unknown;
  postalCode?: unknown;
  prefecture?: unknown;
  city?: unknown;
  street?: unknown;
  building?: unknown;
  phone?: unknown;
  email?: unknown;
};

export type RepairIntakeWatchInput = {
  timepieceType?: unknown;
  driveType?: unknown;
  brandId?: unknown;
  modelName?: unknown;
};

type ParsedCustomerInput = {
  name: string;
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  building: string | null;
  phone: string;
  email: string | null;
};

type ParsedWatchInput = {
  timepieceType: TimepieceType;
  driveType: WatchDriveType;
  brandId: number;
  modelName: string | null;
};

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RepairIntakeError("INVALID_INPUT", `${field} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new RepairIntakeError("INVALID_INPUT", `${field} is invalid.`);
  }
  return value as T;
}

function parseBrandId(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RepairIntakeError("INVALID_INPUT", "watches[].brandId is invalid.");
  }
  return parsed;
}

function parseCustomerInput(value: unknown): ParsedCustomerInput {
  if (!value || typeof value !== "object") {
    throw new RepairIntakeError("INVALID_INPUT", "customer is required.");
  }
  const customer = value as RepairIntakeCustomerInput;
  return {
    name: requiredText(customer.name, "customer.name"),
    postalCode: requiredText(customer.postalCode, "customer.postalCode"),
    prefecture: requiredText(customer.prefecture, "customer.prefecture"),
    city: requiredText(customer.city, "customer.city"),
    street: requiredText(customer.street, "customer.street"),
    building: optionalText(customer.building),
    phone: requiredText(customer.phone, "customer.phone"),
    email: optionalText(customer.email),
  };
}

function parseWatchInputs(value: unknown): ParsedWatchInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RepairIntakeError("INVALID_INPUT", "watches must contain at least one watch.");
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new RepairIntakeError("INVALID_INPUT", `watches[${index}] is invalid.`);
    }
    const watch = entry as RepairIntakeWatchInput;
    return {
      timepieceType: parseEnum(watch.timepieceType, Object.values(TimepieceType), `watches[${index}].timepieceType`),
      driveType: parseEnum(watch.driveType, Object.values(WatchDriveType), `watches[${index}].driveType`),
      brandId: parseBrandId(watch.brandId),
      modelName: optionalText(watch.modelName),
    };
  });
}

function formatCustomerAddress(customer: ParsedCustomerInput) {
  return [customer.prefecture, customer.city, customer.street, customer.building].filter(Boolean).join("");
}

function extractInquirySequence(inquiryNumber: string, prefix: string) {
  const prefixWithSeparator = `${prefix}-`;
  if (!inquiryNumber.startsWith(prefixWithSeparator)) return 0;
  const sequence = Number(inquiryNumber.slice(prefixWithSeparator.length));
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 0;
}

async function nextB2cInquiryNumber(tx: Prisma.TransactionClient, customerId: number) {
  // The legacy C-* namespace is shared by every B2C customer. Serialize only this sequence.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(163)`;
  await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;

  const existingRepairs = await tx.repair.findMany({
    where: { inquiryNumber: { startsWith: "C-" } },
    select: { inquiryNumber: true },
  });
  const maxSequence = existingRepairs.reduce(
    (max, repair) => Math.max(max, extractInquirySequence(repair.inquiryNumber, "C")),
    0,
  );
  const nextSequence = maxSequence + 1;

  await tx.customer.update({
    where: { id: customerId },
    data: { currentSeq: nextSequence, prefix: "C" },
  });

  return `C-${String(nextSequence).padStart(3, "0")}`;
}

function inviteState(invite: { expiresAt: Date; usedAt: Date | null }, now: Date) {
  if (invite.usedAt) return "used" as const;
  if (invite.expiresAt <= now) return "expired" as const;
  return "valid" as const;
}

function assertInviteState(invite: { expiresAt: Date; usedAt: Date | null }, now: Date) {
  const state = inviteState(invite, now);
  if (state === "used") throw new RepairIntakeError("USED_TOKEN", "This intake link has already been used.");
  if (state === "expired") throw new RepairIntakeError("EXPIRED_TOKEN", "This intake link has expired.");
}

export function generateRepairIntakeToken() {
  return crypto.randomBytes(INTAKE_TOKEN_BYTES).toString("base64url");
}

export async function createRepairIntakeInvite(
  input: { expiresAt: Date; customerId?: number | null; lineUserId?: number | null },
  db: DbClient = prisma,
) {
  if (input.expiresAt <= new Date()) {
    throw new RepairIntakeError("INVALID_INPUT", "expiresAt must be in the future.");
  }
  if (input.customerId == null && input.lineUserId == null) {
    throw new RepairIntakeError("INVALID_INPUT", "customerId or lineUserId is required.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateRepairIntakeToken();
    try {
      return await db.repairIntakeInvite.create({
        data: {
          token,
          expiresAt: input.expiresAt,
          customerId: input.customerId ?? null,
          lineUserId: input.lineUserId ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Unable to allocate a unique repair intake token.");
}

/**
 * Returns the current usable staff-issued invite for a B2C customer, or creates one.
 * Used and expired rows remain as history; only an unused, future-dated invite is reused.
 */
export async function createCustomerRepairIntakeInvite(
  customerId: number,
  db: Pick<PrismaClient, "customer" | "repairIntakeInvite"> = prisma,
  now = new Date(),
) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, type: true },
  });
  if (!customer) throw new RepairIntakeError("CUSTOMER_NOT_FOUND", "顧客が見つかりません。");
  if (customer.type !== "individual") {
    throw new RepairIntakeError("B2B_CUSTOMER", "送付受付リンクはB2C顧客のみ発行できます。");
  }

  const activeInvite = await db.repairIntakeInvite.findFirst({
    where: { customerId, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (activeInvite) return { invite: activeInvite, reused: true };

  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + REPAIR_INTAKE_INVITE_TTL_DAYS);
  const invite = await createRepairIntakeInvite({ customerId, expiresAt }, db as DbClient);
  return { invite, reused: false };
}

/**
 * Returns the current usable staff-issued invite for an unlinked LINE user, or
 * creates one. The database primary key is used instead of LINE's external ID.
 */
export async function createLineUserRepairIntakeInvite(
  lineUserId: number,
  db: Pick<PrismaClient, "lineUser" | "repairIntakeInvite"> = prisma,
  now = new Date(),
) {
  const lineUser = await db.lineUser.findUnique({
    where: { id: lineUserId },
    select: { id: true, linkedCustomerId: true },
  });
  if (!lineUser) throw new RepairIntakeError("LINE_USER_NOT_FOUND", "LINEユーザーが見つかりません。");
  if (lineUser.linkedCustomerId !== null) {
    throw new RepairIntakeError("LINE_USER_ALREADY_LINKED", "このLINEユーザーはすでに顧客へ紐付けられています。");
  }

  const activeInvite = await db.repairIntakeInvite.findFirst({
    where: { lineUserId, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (activeInvite) return { invite: activeInvite, reused: true };

  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + REPAIR_INTAKE_INVITE_TTL_DAYS);
  const invite = await createRepairIntakeInvite({ lineUserId, expiresAt }, db as DbClient);
  return { invite, reused: false };
}

export async function getRepairIntakeInviteState(token: string, db: DbClient = prisma) {
  const invite = await db.repairIntakeInvite.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      usedAt: true,
      customerId: true,
      lineUserId: true,
      customer: { select: { name: true, zipCode: true, phone: true, email: true } },
      lineUser: {
        select: {
          linkedCustomer: { select: { name: true, zipCode: true, phone: true, email: true } },
        },
      },
      repairs: {
        select: { id: true, inquiryNumber: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!invite) throw new RepairIntakeError("INVALID_TOKEN", "This intake link is invalid.");

  const now = new Date();
  if (invite.expiresAt <= now) throw new RepairIntakeError("EXPIRED_TOKEN", "This intake link has expired.");
  if (invite.usedAt) {
    return {
      completed: true,
      repairs: invite.repairs,
      count: invite.repairs.length,
    };
  }

  const customer = invite.customer ?? invite.lineUser?.linkedCustomer ?? null;
  return {
    valid: true,
    expiresAt: invite.expiresAt,
    usedAt: invite.usedAt,
    hasLinkedCustomer: invite.customerId !== null || invite.lineUserId !== null,
    prefill: customer ? {
      name: customer.name,
      postalCode: customer.zipCode,
      phone: customer.phone,
      email: customer.email,
    } : null,
  };
}

export async function submitRepairIntake(token: string, payload: unknown) {
  const body = payload && typeof payload === "object" ? payload as { customer?: unknown; watches?: unknown } : null;
  const customerInput = parseCustomerInput(body?.customer);
  const watchesInput = parseWatchInputs(body?.watches);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const invite = await tx.repairIntakeInvite.findUnique({
      where: { token },
      include: { lineUser: { select: { id: true, lineUserId: true, linkedCustomerId: true } } },
    });
    if (!invite) throw new RepairIntakeError("INVALID_TOKEN", "This intake link is invalid.");
    assertInviteState(invite, now);

    // Claiming the invite is conditional so concurrent submissions cannot both create repairs.
    const claimed = await tx.repairIntakeInvite.updateMany({
      where: { id: invite.id, token, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      const current = await tx.repairIntakeInvite.findUnique({ where: { id: invite.id } });
      if (current?.usedAt) throw new RepairIntakeError("USED_TOKEN", "This intake link has already been used.");
      if (current && current.expiresAt <= now) throw new RepairIntakeError("EXPIRED_TOKEN", "This intake link has expired.");
      throw new RepairIntakeError("INVALID_TOKEN", "This intake link is invalid.");
    }

    const linkedCustomerId = invite.customerId ?? invite.lineUser?.linkedCustomerId ?? null;
    let customer = linkedCustomerId
      ? await tx.customer.findUnique({ where: { id: linkedCustomerId } })
      : null;

    const customerData = {
      name: customerInput.name,
      type: "individual",
      prefix: "C",
      isPartner: false,
      zipCode: customerInput.postalCode,
      address: formatCustomerAddress(customerInput),
      phone: customerInput.phone,
      email: customerInput.email,
    };

    if (customer && customer.type !== "individual") {
      throw new RepairIntakeError("INVALID_INPUT", "A B2C intake link cannot be linked to a business customer.");
    }
    if (customer) {
      customer = await tx.customer.update({ where: { id: customer.id }, data: customerData });
    } else {
      customer = await tx.customer.create({ data: { ...customerData, currentSeq: 0, rank: 1 } });
      if (invite.lineUser) {
        await tx.lineUser.update({
          where: { id: invite.lineUser.id },
          data: { linkedCustomerId: customer.id, linkedAt: now },
        });
      }
    }

    const uniqueBrandIds = Array.from(new Set(watchesInput.map((watch) => watch.brandId)));
    const validBrands = await tx.brand.findMany({
      where: {
        id: { in: uniqueBrandIds },
        isWatchBrand: true,
        brandKind: { not: BrandKind.TYPE },
      },
      select: { id: true },
    });
    if (validBrands.length !== uniqueBrandIds.length) {
      throw new RepairIntakeError("INVALID_BRAND", "Each watch must use an eligible watch brand.");
    }

    const repairs = [];
    for (const watchInput of watchesInput) {
      const inquiryNumber = await nextB2cInquiryNumber(tx, customer.id);
      const watch = await tx.watch.create({
        data: {
          customerId: customer!.id,
          brandId: watchInput.brandId,
          modelNameInput: watchInput.modelName,
          timepieceType: watchInput.timepieceType,
          driveType: watchInput.driveType,
        },
      });
      const repair = await tx.repair.create({
        data: {
          inquiryNumber,
          customerId: customer.id,
          watchId: watch.id,
          repairIntakeInviteId: invite.id,
          status: REPAIR_INTAKE_STATUS,
          receptionDate: null,
          returnRecipientName: customerInput.name,
          returnPostalCode: customerInput.postalCode,
          returnPrefecture: customerInput.prefecture,
          returnCity: customerInput.city,
          returnStreet: customerInput.street,
          returnBuilding: customerInput.building,
          returnPhone: customerInput.phone,
        },
      });
      await tx.repairStatusLog.create({ data: { repairId: repair.id, status: REPAIR_INTAKE_STATUS } });
      repairs.push(repair);
    }

    return { customerId: customer.id, repairs: repairs.map((repair) => ({ id: repair.id, inquiryNumber: repair.inquiryNumber })) };
  });
}

export function repairIntakeErrorResponse(error: unknown) {
  if (!(error instanceof RepairIntakeError)) return null;
  const status = error.code === "USED_TOKEN" ? 409 : error.code === "INVALID_INPUT" || error.code === "INVALID_BRAND" ? 400 : 404;
  return { status, body: { error: error.message, code: error.code } };
}
