import type { PrismaClient } from "@prisma/client";

const MIN_JPY_CARD_AMOUNT = 50;
const MAX_JPY_CARD_AMOUNT = 99_999_999;

export function isValidPrepaymentAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= MIN_JPY_CARD_AMOUNT && value <= MAX_JPY_CARD_AMOUNT;
}

export class RepairPrepaymentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function parsePrepaymentInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RepairPrepaymentError("Invalid prepayment request", 400);
  }
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).sort().join(",") !== "amount,purpose") {
    throw new RepairPrepaymentError("Only amount and purpose are accepted", 400);
  }
  if (!isValidPrepaymentAmount(fields.amount)) {
    throw new RepairPrepaymentError("Amount must be an integer from 50 to 99,999,999 JPY", 400);
  }
  if (typeof fields.purpose !== "string" || !fields.purpose.trim()) {
    throw new RepairPrepaymentError("Purpose is required", 400);
  }
  return { amount: fields.amount, purpose: fields.purpose.trim() };
}

export async function createRepairPrepayment(
  db: PrismaClient,
  repairId: number,
  input: { amount: number; purpose: string },
) {
  const { amount, purpose } = parsePrepaymentInput(input);
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    throw new RepairPrepaymentError("Invalid Repair ID", 400);
  }
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
      if (rows.length !== 1) throw new RepairPrepaymentError("Repair not found", 404);
      const repair = await tx.repair.findUnique({
        where: { id: repairId },
        select: {
          id: true,
          customerId: true,
          publicToken: true,
          customer: { select: { type: true } },
          estimateDocument: { select: { publicToken: true } },
        },
      });
      if (!repair) throw new RepairPrepaymentError("Repair not found", 404);
      if (repair.customer.type !== "individual") {
        throw new RepairPrepaymentError("Online prepayment is available only for individual customers", 403);
      }
      if (!repair.publicToken?.trim() && !repair.estimateDocument?.publicToken?.trim()) {
        throw new RepairPrepaymentError("Customer repair link is unavailable", 409);
      }
      const pending = await tx.payment.findFirst({
        where: { repairId, kind: "REPAIR_PREPAYMENT", status: "PENDING" },
        include: { allocations: { select: { id: true } } },
      });
      if (pending) {
        if (pending.customerId === repair.customerId
          && pending.amount === amount
          && pending.purpose === purpose
          && pending.currency === "JPY"
          && pending.provider === "STRIPE"
          && pending.method === "CARD"
          && pending.allocations.length === 0) {
          return { payment: pending, reused: true };
        }
        throw new RepairPrepaymentError("A different pending prepayment already exists", 409);
      }
      const payment = await tx.payment.create({
        data: {
          kind: "REPAIR_PREPAYMENT",
          repairId,
          customerId: repair.customerId,
          purpose,
          amount,
          currency: "JPY",
          provider: "STRIPE",
          method: "CARD",
          status: "PENDING",
        },
        include: { allocations: { select: { id: true } } },
      });
      return { payment, reused: false };
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
      throw new RepairPrepaymentError("Prepayment changed concurrently; please retry", 409);
    }
    throw error;
  }
}
