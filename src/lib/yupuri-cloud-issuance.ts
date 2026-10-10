import { Prisma, type PrismaClient, type Shipment } from "@prisma/client";
import { shipmentId } from "./shipment";
import { yupuriCloudCsv, type YupuriCloudShipment } from "./yupuri-cloud";

export class CloudIssuanceError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "CloudIssuanceError";
  }
}

const carrierCode = "JAPAN_POST";
const serviceCode = "YU_PACK";

function bodyRecord(body: unknown, keys: string[]): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) {
    throw new CloudIssuanceError(400, "入力が不正です。");
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !keys.includes(key)) || Object.keys(value).length !== keys.length) {
    throw new CloudIssuanceError(400, "入力が不正です。");
  }
  return value;
}

export function parseIssueRequest(body: unknown): { confirmed: true } {
  const value = bodyRecord(body, ["confirmed"]);
  if (value.confirmed !== true) throw new CloudIssuanceError(400, "送り状発行には明示的な確認が必要です。");
  return { confirmed: true };
}

export function parseIssueComplete(body: unknown): { shipmentId: number; managementNumber: string; trackingNumber: string } {
  const value = bodyRecord(body, ["shipmentId", "managementNumber", "trackingNumber"]);
  if (typeof value.shipmentId !== "number") throw new CloudIssuanceError(400, "発送IDが不正です。");
  let id: number;
  try { id = shipmentId(value.shipmentId); }
  catch { throw new CloudIssuanceError(400, "発送IDが不正です。"); }
  if (value.managementNumber !== `SHP-${id}`) throw new CloudIssuanceError(400, "管理番号が一致しません。");
  if (typeof value.trackingNumber !== "string" || !/^\d{12}$/.test(value.trackingNumber)) {
    throw new CloudIssuanceError(400, "追跡番号は12桁の数字が必要です。");
  }
  return { shipmentId: id, managementNumber: value.managementNumber, trackingNumber: value.trackingNumber };
}

function clean(shipment: Pick<Shipment, "direction" | "actualShippedAt" | "trackingNumber" | "labelIssuedAt" | "carrierCode" | "serviceCode">): boolean {
  return shipment.direction === "OUTBOUND" && shipment.actualShippedAt === null &&
    shipment.trackingNumber === null && shipment.labelIssuedAt === null &&
    (shipment.carrierCode === null || shipment.carrierCode === carrierCode) &&
    (shipment.serviceCode === null || shipment.serviceCode === serviceCode);
}

function ready(shipment: Shipment): boolean {
  return shipment.status === "READY" && clean(shipment) &&
    shipment.carrierCode === carrierCode && shipment.serviceCode === serviceCode;
}

function issued(shipment: Shipment, trackingNumber: string): boolean {
  return shipment.status === "LABEL_ISSUED" && shipment.direction === "OUTBOUND" &&
    shipment.actualShippedAt === null && shipment.trackingNumber === trackingNumber &&
    shipment.labelIssuedAt !== null && shipment.carrierCode === carrierCode && shipment.serviceCode === serviceCode;
}

export async function requestCloudIssue(db: PrismaClient, id: number, input: { confirmed: true }, now = new Date()) {
  parseIssueRequest(input);
  return db.$transaction(async tx => {
    const shipment = await tx.shipment.findUnique({ where: { id } });
    if (!shipment) throw new CloudIssuanceError(404, "発送が見つかりません。");
    if (shipment.status === "LABEL_ISSUED" && shipment.trackingNumber && issued(shipment, shipment.trackingNumber)) {
      return { shipmentId: id, status: "LABEL_ISSUED" as const, alreadyIssued: true, trackingNumber: shipment.trackingNumber };
    }
    if (!clean(shipment) || !["DRAFT", "READY"].includes(shipment.status)) {
      throw new CloudIssuanceError(409, "この発送は送り状発行できません。状態を再確認してください。");
    }
    // The worker must receive the same validated payload that is approved here.
    yupuriCloudCsv({ ...shipment, status: "READY" }, now);
    if (shipment.status === "DRAFT") {
      const updated = await tx.shipment.updateMany({
        where: { id, status: "DRAFT", direction: "OUTBOUND", actualShippedAt: null,
          trackingNumber: null, labelIssuedAt: null, carrierCode: shipment.carrierCode, serviceCode: shipment.serviceCode },
        data: { status: "READY", carrierCode, serviceCode },
      });
      if (updated.count !== 1) throw new CloudIssuanceError(409, "発送の状態が変更されました。");
    } else if (!ready(shipment)) {
      throw new CloudIssuanceError(409, "発送の配送コードが一致しません。");
    }
    return { shipmentId: id, status: "READY" as const, alreadyIssued: false, trackingNumber: null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function nextCloudIssue(db: PrismaClient, now = new Date()) {
  const candidates = await db.shipment.findMany({
    where: { direction: "OUTBOUND", status: "READY", actualShippedAt: null,
      trackingNumber: null, labelIssuedAt: null, carrierCode, serviceCode },
    orderBy: [{ plannedShipDate: "asc" }, { id: "asc" }],
    take: 1,
  });
  const shipment = candidates[0];
  if (!shipment) return null;
  const csv = yupuriCloudCsv(shipment as YupuriCloudShipment, now);
  return { shipmentId: shipment.id, managementNumber: `SHP-${shipment.id}`, csvBase64: csv.toString("base64") };
}

export async function completeCloudIssue(db: PrismaClient, input: ReturnType<typeof parseIssueComplete>, now = new Date()) {
  const { shipmentId: id, trackingNumber } = parseIssueComplete(input);
  return db.$transaction(async tx => {
    const shipment = await tx.shipment.findUnique({ where: { id } });
    if (!shipment) throw new CloudIssuanceError(404, "発送が見つかりません。");
    if (issued(shipment, trackingNumber)) return { shipmentId: id, status: "LABEL_ISSUED" as const, alreadyIssued: true };
    if (!ready(shipment)) throw new CloudIssuanceError(409, "発送の状態が変更されました。追跡番号を保存できません。");
    const other = await tx.shipment.findFirst({ where: { trackingNumber, id: { not: id } }, select: { id: true } });
    if (other) throw new CloudIssuanceError(409, "追跡番号は別の発送に登録済みです。");
    const updated = await tx.shipment.updateMany({
      where: { id, direction: "OUTBOUND", status: "READY", actualShippedAt: null,
        trackingNumber: null, labelIssuedAt: null, carrierCode, serviceCode },
      data: { status: "LABEL_ISSUED", trackingNumber, labelIssuedAt: now },
    });
    if (updated.count !== 1) throw new CloudIssuanceError(409, "発送の状態が変更されました。");
    return { shipmentId: id, status: "LABEL_ISSUED" as const, alreadyIssued: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function cloudIssueFailure(error: unknown): { status: number; message: string } {
  if (error instanceof CloudIssuanceError) return { status: error.status, message: error.message };
  if (error && typeof error === "object" && "status" in error &&
    (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
    return { status: error.status as number, message: error instanceof Error ? error.message : "CSVを生成できません。" };
  }
  if (error && typeof error === "object" && "code" in error && (error.code === "P2034" || error.code === "P2002")) {
    return { status: 409, message: "発送の状態が変更されました。" };
  }
  return { status: 500, message: "送り状発行処理に失敗しました。" };
}
