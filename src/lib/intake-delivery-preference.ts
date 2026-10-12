import { randomUUID } from "node:crypto";
import { Prisma, RepairIntakeDeliveryGroupKind, type PrismaClient } from "@prisma/client";
import { deliveryPreferenceMode, parseDeliveryPreferenceInput, RepairDeliveryPreferenceError } from "./repair-delivery-preference";

export class IntakeDeliveryPreferenceError extends Error {
  constructor(public status: 404 | 409, message: string) { super(message); }
}

const missing = () => new IntakeDeliveryPreferenceError(404, "回答ページが見つかりません。");
const unavailable = () => new IntakeDeliveryPreferenceError(409, "この受付の配達希望は現在回答できません。修理状況を更新してください。");
const complete = (status: string) => status === "作業完了";
const dateString = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

async function context(tx: Prisma.TransactionClient, token: string, validateShipments = true) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw missing();
  const anchor = await tx.repair.findUnique({ where: { publicToken: token }, select: {
    id: true, customerId: true, repairIntakeInviteId: true, customer: { select: { type: true } },
  } });
  if (!anchor || !anchor.repairIntakeInviteId || anchor.customer.type !== "individual") throw missing();
  const invite = await tx.repairIntakeInvite.findUnique({ where: { id: anchor.repairIntakeInviteId }, select: {
    id: true, usedAt: true, revokedAt: true, customerId: true, lineUserId: true, inquiryId: true,
    inquiry: { select: { lineUserId: true } },
    lineUser: { select: { linkedCustomerId: true } },
    inquiryWatches: { select: { inquiryWatch: { select: { inquiryId: true, promotedRepairId: true } } } },
    repairs: { orderBy: { id: "asc" }, select: {
      id: true, customerId: true, inquiryNumber: true, status: true, publicToken: true, publicTokenCreatedAt: true,
      customer: { select: { type: true } },
      shipmentRepairs: { select: { shipment: { select: {
        id: true, customerId: true, direction: true, status: true, actualShippedAt: true,
        repairs: { select: { repairId: true } },
      } } } },
    } },
    shippingDecision: { select: {
      customerId: true, choice: true, requestOutbox: { select: { status: true, idempotencyKey: true, inquiryId: true, sourceRepairId: true } },
      repairs: { select: { repairId: true, repairIntakeInviteId: true, completedAtRequest: true } },
    } },
    deliveryPreferences: { include: { repairs: true } },
  } });
  if (!invite?.usedAt || invite.revokedAt || !invite.inquiryId || !invite.lineUserId ||
      invite.inquiry?.lineUserId !== invite.lineUserId || invite.lineUser?.linkedCustomerId !== anchor.customerId ||
      (invite.customerId !== null && invite.customerId !== anchor.customerId) || invite.repairs.length < 2) throw missing();
  const ids = new Set(invite.repairs.map(r => r.id));
  if (!ids.has(anchor.id) || invite.inquiryWatches.length !== ids.size ||
      new Set(invite.inquiryWatches.map(w => w.inquiryWatch.promotedRepairId)).size !== ids.size ||
      invite.inquiryWatches.some(w => w.inquiryWatch.inquiryId !== invite.inquiryId || !w.inquiryWatch.promotedRepairId || !ids.has(w.inquiryWatch.promotedRepairId)) ||
      invite.repairs.some(r => r.customerId !== anchor.customerId || r.customer.type !== "individual" ||
        !r.publicToken || r.publicTokenCreatedAt?.getTime() !== invite.usedAt!.getTime() || r.status.includes("キャンセル"))) throw unavailable();

  const decision = invite.shippingDecision;
  if (decision && (decision.customerId !== anchor.customerId || decision.requestOutbox.status === "CANCELLED" ||
      decision.requestOutbox.idempotencyKey !== `intake-shipping-decision-request:${invite.id}` ||
      decision.requestOutbox.inquiryId !== invite.inquiryId || decision.requestOutbox.sourceRepairId !== null ||
      decision.repairs.length !== ids.size || new Set(decision.repairs.map(r => r.repairId)).size !== ids.size ||
      !decision.repairs.some(r => r.completedAtRequest) || !decision.repairs.some(r => !r.completedAtRequest) ||
      decision.repairs.some(r => r.repairIntakeInviteId !== invite.id || !ids.has(r.repairId)))) throw unavailable();
  const groups = decision?.choice === "SHIP_COMPLETED" ? [
    { kind: RepairIntakeDeliveryGroupKind.COMPLETED_AT_REQUEST, ids: decision.repairs.filter(r => r.completedAtRequest).map(r => r.repairId) },
    { kind: RepairIntakeDeliveryGroupKind.REMAINING, ids: decision.repairs.filter(r => !r.completedAtRequest).map(r => r.repairId) },
  ] : [{ kind: RepairIntakeDeliveryGroupKind.ALL, ids: decision ? decision.repairs.map(r => r.repairId) : invite.repairs.map(r => r.id) }];
  const preferences = invite.deliveryPreferences;
  if (preferences.length > groups.length || new Set(preferences.map(p => p.kind)).size !== preferences.length ||
      preferences.some(prior => {
        const group = groups.find(g => g.kind === prior.kind);
        return !group || prior.repairIntakeInviteId !== invite.id || prior.customerId !== anchor.customerId ||
          prior.repairs.length !== group.ids.length || new Set(prior.repairs.map(r => r.repairId)).size !== group.ids.length ||
          prior.repairs.some(r => r.repairIntakeInviteId !== invite.id || r.customerId !== anchor.customerId || !group.ids.includes(r.repairId));
      }) || (groups.length === 2 && preferences.some(p => p.kind === RepairIntakeDeliveryGroupKind.REMAINING) &&
        !preferences.some(p => p.kind === RepairIntakeDeliveryGroupKind.COMPLETED_AT_REQUEST))) throw unavailable();
  const group = groups.length === 2 && preferences.some(p => p.kind === RepairIntakeDeliveryGroupKind.COMPLETED_AT_REQUEST)
    ? groups[1] : groups[0];
  const targetIds = group.ids;
  const prior = preferences.find(p => p.kind === group.kind) ?? null;
  const available = Boolean(prior) || (decision ? Boolean(decision.choice) &&
    (group.kind === RepairIntakeDeliveryGroupKind.COMPLETED_AT_REQUEST || targetIds.every(id => complete(invite.repairs.find(r => r.id === id)!.status)))
    : invite.repairs.every(r => complete(r.status)));
  const activeShipments = [...new Map(invite.repairs.flatMap(r => r.shipmentRepairs)
    .map(link => link.shipment)
    .filter(shipment => shipment.direction === "OUTBOUND" && shipment.status !== "CANCELLED" && shipment.actualShippedAt === null)
    .map(shipment => [shipment.id, shipment] as const)).values()];
  const matchedKinds = activeShipments.map(shipment => {
    const shipmentIds = shipment.repairs.map(r => r.repairId);
    if (shipment.customerId !== anchor.customerId) return null;
    return preferences.find(p => p.repairs.length === shipmentIds.length &&
        new Set(shipmentIds).size === shipmentIds.length &&
        p.repairs.every(r => shipmentIds.includes(r.repairId)))?.kind ?? null;
  });
  if (validateShipments && (matchedKinds.some(kind => kind === null) || new Set(matchedKinds).size !== matchedKinds.length)) throw unavailable();
  return { invite, anchor, groups, targetIds, kind: group.kind, available, prior };
}

export async function isGroupedDeliveryApplicable(db: Prisma.TransactionClient, token: string) {
  try {
    const current = await context(db, token, false);
    return Boolean(current.invite.shippingDecision) || current.available || Boolean(current.prior);
  } catch (error) {
    if (error instanceof IntakeDeliveryPreferenceError) return false;
    throw error;
  }
}

function payload(result: Awaited<ReturnType<typeof context>>, submittedKind = result.kind) {
  const { invite } = result;
  const group = result.groups.find(candidate => candidate.kind === submittedKind);
  if (!group) throw unavailable();
  const targetIds = group.ids;
  const prior = invite.deliveryPreferences.find(preference => preference.kind === submittedKind) ?? null;
  const available = submittedKind === result.kind ? result.available : Boolean(prior);
  return {
    groupKind: submittedKind,
    visible: Boolean(prior) || Boolean(invite.shippingDecision?.choice) || (!invite.shippingDecision && available),
    available,
    repairs: invite.repairs.filter(r => targetIds.includes(r.id)).map(r => ({ inquiryNumber: r.inquiryNumber })),
    preference: prior ? {
      mode: deliveryPreferenceMode(prior),
      requestedDeliveryDate: dateString(prior.requestedDeliveryDate),
      requestedDeliveryTimeSlot: prior.requestedDeliveryTimeSlot,
      respondedAt: prior.respondedAt.toISOString(),
    } : null,
  };
}

export async function getPublicIntakeDeliveryPreference(db: PrismaClient, token: string) {
  return payload(await context(db as Prisma.TransactionClient, token));
}

export async function completionDeliveryPath(db: PrismaClient, repairId: number, token: string | null) {
  const repair = await db.repair.findUnique({ where: { id: repairId }, select: { repairIntakeInviteId: true, publicToken: true, customer: { select: { type: true } } } });
  if (!repair) throw missing();
  if (repair.customer.type !== "individual" || !repair.repairIntakeInviteId) return token ? `/customer/delivery/${token}` : null;
  const members = await db.repair.findMany({ where: { repairIntakeInviteId: repair.repairIntakeInviteId }, select: { id: true } });
  if (members.length <= 1) return token ? `/customer/delivery/${token}` : null;
  if (!repair.publicToken || !await isGroupedDeliveryApplicable(db as Prisma.TransactionClient, repair.publicToken)) {
    return token ? `/customer/delivery/${token}` : null;
  }
  if (!token) throw unavailable();
  const current = await context(db as Prisma.TransactionClient, token);
  if (!current.available || current.invite.shippingDecision) throw unavailable();
  return `/customer/repairs/${token}`;
}

export async function savePublicIntakeDeliveryPreference(db: PrismaClient, token: string, raw: unknown, now = new Date()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      Object.keys(raw).some(key => !["groupKind", "mode", "date", "timeSlot"].includes(key)) ||
      !Object.values(RepairIntakeDeliveryGroupKind).includes((raw as { groupKind?: RepairIntakeDeliveryGroupKind }).groupKind!)) {
    throw new RepairDeliveryPreferenceError(400, "入力が不正です。");
  }
  const { groupKind, ...answer } = raw as { groupKind: RepairIntakeDeliveryGroupKind; mode?: unknown; date?: unknown; timeSlot?: unknown };
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw missing();
  const anchor = await db.repair.findUnique({ where: { publicToken: token }, select: { repairIntakeInviteId: true } });
  if (!anchor?.repairIntakeInviteId) throw missing();
  try {
    return await db.$transaction(async tx => {
      const inviteId = anchor.repairIntakeInviteId!;
      const initial = await tx.repairIntakeInvite.findUnique({ where: { id: inviteId }, select: { lineUserId: true, customerId: true, lineUser: { select: { linkedCustomerId: true } } } });
      if (!initial) throw missing();
      const customerId = initial.lineUser?.linkedCustomerId ?? initial.customerId;
      if (!customerId) throw unavailable();
      if (initial.lineUserId) await tx.$queryRaw`SELECT "id" FROM "LineUser" WHERE "id" = ${initial.lineUserId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "RepairIntakeInvite" WHERE "id" = ${inviteId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "repairIntakeInviteId" = ${inviteId} ORDER BY "id" FOR UPDATE`;
      const current = await context(tx, token);
      if (current.anchor.customerId !== customerId) throw unavailable();
      const group = current.groups.find(candidate => candidate.kind === groupKind);
      if (!group) throw unavailable();
      const prior = current.invite.deliveryPreferences.find(preference => preference.kind === groupKind);
      if (!prior && (groupKind !== current.kind || !current.available)) throw unavailable();
      const normalized = parseDeliveryPreferenceInput(answer, prior?.respondedAt ?? now);
      if (prior) {
        if (dateString(prior.requestedDeliveryDate) !== dateString(normalized.requestedDeliveryDate) ||
            prior.requestedDeliveryTimeSlot !== normalized.requestedDeliveryTimeSlot) throw unavailable();
        return payload(current, groupKind);
      }
      await tx.repairIntakeDeliveryPreference.create({ data: {
        id: randomUUID(), repairIntakeInviteId: inviteId, customerId, kind: groupKind,
        requestedDeliveryDate: normalized.requestedDeliveryDate,
        requestedDeliveryTimeSlot: normalized.requestedDeliveryTimeSlot, respondedAt: now,
        repairs: { create: group.ids.map(repairId => ({ repairId, customerId })) },
      } });
      return payload(await context(tx, token), groupKind);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw unavailable();
    throw error;
  }
}
