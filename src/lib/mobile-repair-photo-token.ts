import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const lifetimeSeconds = 30 * 60;

function signingKey() {
  if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is required for mobile photo tokens");
  return createHmac("sha256", process.env.NEXTAUTH_SECRET).update("mobile-repair-photo-upload-v1").digest();
}

export function createMobileRepairPhotoToken(repairId: number, now = Date.now()) {
  if (!Number.isSafeInteger(repairId) || repairId <= 0) throw new Error("Invalid repair ID");
  const payload = `${repairId}.${Math.floor(now / 1000) + lifetimeSeconds}.${randomBytes(16).toString("hex")}`;
  const signature = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifiedMobileRepairPhotoId(token: unknown, now = Date.now()): number | null {
  if (typeof token !== "string" || token.length > 256 || !process.env.NEXTAUTH_SECRET) return null;
  const match = /^(\d+)\.(\d+)\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const repairId = Number(match[1]);
  if (!Number.isSafeInteger(repairId) || repairId <= 0) return null;
  const expiresAt = Number(match[2]);
  const current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= current || expiresAt > current + lifetimeSeconds) return null;
  const payload = `${match[1]}.${match[2]}.${match[3]}`;
  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  const actual = Buffer.from(match[4], "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? repairId : null;
}

export function verifyMobileRepairPhotoToken(token: unknown, repairId: number, now = Date.now()) {
  return Number.isSafeInteger(repairId) && repairId > 0 && verifiedMobileRepairPhotoId(token, now) === repairId;
}
