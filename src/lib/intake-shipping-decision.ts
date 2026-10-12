import { Prisma, type PrismaClient, type RepairIntakeShippingChoice } from "@prisma/client";
import { buildCustomerShareUrl } from "./customer-share-url";
import { createApprovedLineManagerSendOutbox } from "./line-manager-send-outbox";

export class IntakeShippingDecisionError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) { super(message); }
}

export const intakeShippingDecisionKey = (inviteId: number) => `intake-shipping-decision-request:${inviteId}`;
const complete = (status: string) => status === "作業完了";
const unavailable = () => new IntakeShippingDecisionError(409, "この受付の発送確認は現在利用できません。状態を更新してください。");

async function group(tx: Prisma.TransactionClient, inviteId: number, requireNewRequestEligibility: boolean) {
  const invite = await tx.repairIntakeInvite.findUnique({ where: { id: inviteId }, select: {
    id: true, usedAt: true, revokedAt: true, customerId: true, lineUserId: true, inquiryId: true,
    inquiry: { select: { lineUserId: true } },
    lineUser: { select: { linkedCustomerId: true, lineManagerChat: { select: { id: true, verifiedAt: true } } } },
    inquiryWatches: { select: { inquiryWatch: { select: { inquiryId: true, promotedRepairId: true } } } },
    repairs: { orderBy: { id: "asc" }, select: {
      id: true, inquiryNumber: true, customerId: true, status: true, publicToken: true, publicTokenCreatedAt: true,
      customer: { select: { type: true } },
      shipmentRepairs: { select: { shipment: { select: { direction: true, status: true } } } },
    } },
  } });
  if (!invite?.usedAt || invite.revokedAt || !invite.inquiryId || !invite.lineUserId ||
      invite.inquiry?.lineUserId !== invite.lineUserId ||
      !invite.lineUser?.linkedCustomerId || invite.repairs.length < 2) throw unavailable();
  const customerId = invite.lineUser.linkedCustomerId;
  const ids = new Set(invite.repairs.map(r => r.id));
  if ((invite.customerId !== null && invite.customerId !== customerId) ||
      invite.inquiryWatches.length !== invite.repairs.length ||
      invite.inquiryWatches.some(w => w.inquiryWatch.inquiryId !== invite.inquiryId || !w.inquiryWatch.promotedRepairId || !ids.has(w.inquiryWatch.promotedRepairId)) ||
      new Set(invite.inquiryWatches.map(w => w.inquiryWatch.promotedRepairId)).size !== ids.size ||
      invite.repairs.some(r => r.customerId !== customerId || r.customer.type !== "individual" ||
        !r.publicToken || r.publicTokenCreatedAt?.getTime() !== invite.usedAt!.getTime() || r.status.includes("キャンセル") ||
        r.shipmentRepairs.some(s => s.shipment.direction === "OUTBOUND" && s.shipment.status !== "CANCELLED"))) throw unavailable();
  const completed = invite.repairs.filter(r => complete(r.status));
  if (requireNewRequestEligibility && (!invite.lineUser.lineManagerChat?.verifiedAt ||
      !completed.length || completed.length === invite.repairs.length)) throw unavailable();
  return { invite, customerId, completed };
}

async function lockedGroup(tx: Prisma.TransactionClient, inviteId: number) {
  const initial = await tx.repairIntakeInvite.findUnique({ where: { id: inviteId }, select: { customerId: true, lineUserId: true, lineUser: { select: { linkedCustomerId: true } } } });
  if (!initial) throw new IntakeShippingDecisionError(404, "受付が見つかりません。");
  const customerId = initial.lineUser?.linkedCustomerId ?? initial.customerId;
  if (!customerId) throw unavailable();
  if (initial.lineUserId) await tx.$queryRaw`SELECT "id" FROM "LineUser" WHERE "id" = ${initial.lineUserId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "RepairIntakeInvite" WHERE "id" = ${inviteId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "repairIntakeInviteId" = ${inviteId} ORDER BY "id" FOR UPDATE`;
  const current = await group(tx, inviteId, false);
  if (current.customerId !== customerId) throw unavailable();
  return current;
}

function validSnapshot(
  inviteId: number,
  repairIds: number[],
  snapshot: { repairIntakeInviteId: number; repairId: number; completedAtRequest: boolean }[],
) {
  return snapshot.length === repairIds.length &&
    new Set(snapshot.map(row => row.repairId)).size === repairIds.length &&
    snapshot.some(row => row.completedAtRequest) && snapshot.some(row => !row.completedAtRequest) &&
    snapshot.every(row => row.repairIntakeInviteId === inviteId &&
      typeof row.completedAtRequest === "boolean" && repairIds.includes(row.repairId));
}

export async function getAdminIntakeShippingDecision(db: PrismaClient, repairId: number) {
  const repair = await db.repair.findUnique({ where: { id: repairId }, select: { repairIntakeInviteId: true } });
  if (!repair) throw new IntakeShippingDecisionError(404, "修理が見つかりません。");
  if (!repair.repairIntakeInviteId) return { eligible: false, decision: null };
  const decision = await db.repairIntakeShippingDecision.findUnique({ where: { repairIntakeInviteId: repair.repairIntakeInviteId }, select: {
    choice: true, requestedAt: true, respondedAt: true, requestOutbox: { select: { status: true, confirmedAt: true } },
  } });
  let eligible = false;
  try { await group(db as Prisma.TransactionClient, repair.repairIntakeInviteId, true); eligible = true; } catch (error) {
    if (!(error instanceof IntakeShippingDecisionError)) throw error;
  }
  return { eligible, decision };
}

export async function requestIntakeShippingDecision(db: PrismaClient, repairId: number, appUrl: string | undefined) {
  const source = await db.repair.findUnique({ where: { id: repairId }, select: { repairIntakeInviteId: true } });
  if (!source) throw new IntakeShippingDecisionError(404, "修理が見つかりません。");
  if (!source.repairIntakeInviteId) throw unavailable();
  try {
    return await db.$transaction(async tx => {
      const { invite, customerId, completed } = await lockedGroup(tx, source.repairIntakeInviteId!);
      if (!invite.repairs.some(r => r.id === repairId)) throw unavailable();
      const prior = await tx.repairIntakeShippingDecision.findUnique({ where: { repairIntakeInviteId: invite.id }, include: { repairs: true, requestOutbox: true } });
      if (prior) {
        if (prior.customerId !== customerId || prior.requestOutbox.status === "CANCELLED" ||
            prior.requestOutbox.idempotencyKey !== intakeShippingDecisionKey(invite.id) ||
            prior.requestOutbox.inquiryId !== invite.inquiryId || prior.requestOutbox.sourceRepairId !== null ||
            !validSnapshot(invite.id, invite.repairs.map(r => r.id), prior.repairs)) throw unavailable();
        return { choice: prior.choice, requestedAt: prior.requestedAt, status: prior.requestOutbox.status };
      }
      if (await tx.repairIntakeDeliveryPreference.findFirst({ where: { repairIntakeInviteId: invite.id }, select: { repairIntakeInviteId: true } })) throw unavailable();
      if (!invite.lineUser?.lineManagerChat?.verifiedAt || !completed.length || completed.length === invite.repairs.length) throw unavailable();
      if (!appUrl || !/^https:\/\//i.test(appUrl)) throw unavailable();
      const url = buildCustomerShareUrl(`/customer/repairs/${invite.repairs[0].publicToken}`, appUrl, appUrl);
      const text = `一部の時計の修理が完了しました。\n完成した${completed.length}本を先に発送するか、すべて完成するまで待つか、下記の修理状況ページからご回答ください。\n${url}`;
      const outbox = await createApprovedLineManagerSendOutbox(tx, {
        inquiryId: invite.inquiryId!, lineManagerChatId: invite.lineUser!.lineManagerChat!.id,
        idempotencyKey: intakeShippingDecisionKey(invite.id), text,
      });
      const decision = await tx.repairIntakeShippingDecision.create({ data: {
        repairIntakeInviteId: invite.id, customerId, requestOutboxId: outbox.id,
        repairs: { create: invite.repairs.map(r => ({ repairId: r.id, completedAtRequest: complete(r.status) })) },
      } });
      return { choice: decision.choice, requestedAt: decision.requestedAt, status: outbox.status };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof IntakeShippingDecisionError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw unavailable();
    throw error;
  }
}

async function publicContext(tx: Prisma.TransactionClient, token: string) {
  if (!token || token.length > 128 || /^\d+$/.test(token)) throw new IntakeShippingDecisionError(404, "ページが見つかりません。");
  const anchor = await tx.repair.findUnique({ where: { publicToken: token }, select: { id: true, customerId: true, repairIntakeInviteId: true, customer: { select: { type: true } } } });
  if (!anchor || !anchor.repairIntakeInviteId || anchor.customer.type !== "individual") throw new IntakeShippingDecisionError(404, "ページが見つかりません。");
  const decision = await tx.repairIntakeShippingDecision.findUnique({ where: { repairIntakeInviteId: anchor.repairIntakeInviteId }, include: { repairs: true, requestOutbox: { select: { status: true, idempotencyKey: true, inquiryId: true, sourceRepairId: true } } } });
  if (!decision || decision.customerId !== anchor.customerId || decision.requestOutbox.status === "CANCELLED") throw new IntakeShippingDecisionError(404, "ページが見つかりません。");
  const { invite, customerId } = await group(tx, anchor.repairIntakeInviteId, false);
  if (customerId !== anchor.customerId ||
      decision.requestOutbox.idempotencyKey !== intakeShippingDecisionKey(invite.id) ||
      decision.requestOutbox.inquiryId !== invite.inquiryId || decision.requestOutbox.sourceRepairId !== null ||
      !invite.repairs.some(r => r.id === anchor.id) ||
      !validSnapshot(invite.id, invite.repairs.map(r => r.id), decision.repairs)) throw unavailable();
  return { decision, invite };
}

export async function getPublicIntakeShippingDecision(db: PrismaClient, token: string) {
  const { decision, invite } = await publicContext(db as Prisma.TransactionClient, token);
  return { choice: decision.choice, requestedAt: decision.requestedAt, respondedAt: decision.respondedAt,
    repairs: invite.repairs.map(r => ({ inquiryNumber: r.inquiryNumber,
      completedAtRequest: decision.repairs.find(s => s.repairId === r.id)!.completedAtRequest })) };
}

export async function respondIntakeShippingDecision(db: PrismaClient, token: string, choice: RepairIntakeShippingChoice) {
  if (choice !== "SHIP_COMPLETED" && choice !== "WAIT_ALL") throw new IntakeShippingDecisionError(400, "回答を選択してください。");
  const anchor = await db.repair.findUnique({ where: { publicToken: token }, select: { repairIntakeInviteId: true } });
  if (!anchor?.repairIntakeInviteId) throw new IntakeShippingDecisionError(404, "ページが見つかりません。");
  try {
    return await db.$transaction(async tx => {
      await lockedGroup(tx, anchor.repairIntakeInviteId!);
      const { decision } = await publicContext(tx, token);
      if (decision.choice) {
        if (decision.choice !== choice) throw unavailable();
        return { choice: decision.choice, respondedAt: decision.respondedAt };
      }
      const updated = await tx.repairIntakeShippingDecision.update({ where: { repairIntakeInviteId: anchor.repairIntakeInviteId! }, data: { choice, respondedAt: new Date() } });
      return { choice: updated.choice, respondedAt: updated.respondedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw unavailable();
    throw error;
  }
}
