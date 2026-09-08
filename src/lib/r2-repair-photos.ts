import "server-only";

import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const acceptedMimeTypes = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

function config() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("R2 repair photo storage is not configured.");
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}
function client() { const c = config(); return new S3Client({ endpoint: c.endpoint, region: "auto", credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } }); }
function bucket() { return config().bucket; }

export function isR2RepairPhotoKey(value: string | null | undefined): value is string { return typeof value === "string" && /^repairs\/\d+\/\d{6}\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(value); }
export function isR2PublicCasePhotoKey(value: string | null | undefined): value is string { return typeof value === "string" && /^public-cases\/\d+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(value); }
function extensionForMimeType(mimeType: string) { const extension = acceptedMimeTypes.get(mimeType.toLowerCase()); if (!extension) throw new Error("Unsupported repair photo type."); return extension; }

export function repairPhotoObjectKey(repairId: number, mimeType: string, date = new Date()) {
  if (!Number.isInteger(repairId) || repairId <= 0) throw new Error("Invalid repair ID.");
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `repairs/${repairId}/${ym}/${randomUUID()}.${extensionForMimeType(mimeType)}`;
}
export async function uploadRepairPhotoObject(params: { repairId: number; body: Buffer; contentType: string }) {
  const key = repairPhotoObjectKey(params.repairId, params.contentType);
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: params.body, ContentType: params.contentType, CacheControl: "private, max-age=0" }));
  return key;
}
export async function getRepairPhotoSignedReadUrl(key: string, expiresIn = 300) {
  if (!isR2RepairPhotoKey(key) && !isR2PublicCasePhotoKey(key)) throw new Error("Invalid R2 repair photo key.");
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}
export async function deleteRepairPhotoObject(key: string) {
  if (!isR2RepairPhotoKey(key) && !isR2PublicCasePhotoKey(key)) return;
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
export async function copyRepairPhotoObjectToPublicCase(params: { sourceKey: string; publicCaseId: number }) {
  if (!isR2RepairPhotoKey(params.sourceKey) || !Number.isInteger(params.publicCaseId) || params.publicCaseId <= 0) throw new Error("Invalid R2 photo copy request.");
  const destinationKey = `public-cases/${params.publicCaseId}/${randomUUID()}.${params.sourceKey.split(".").pop()!.toLowerCase()}`;
  await client().send(new CopyObjectCommand({ Bucket: bucket(), Key: destinationKey, CopySource: `${bucket()}/${encodeURIComponent(params.sourceKey).replace(/%2F/g, "/")}`, MetadataDirective: "COPY" }));
  return destinationKey;
}
