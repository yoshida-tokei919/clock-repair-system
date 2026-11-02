import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// The existing private repair-photo R2 bucket is shared by this server-only
// document prefix. No public R2 URL or signed URL is issued for invoices.
function storage() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("Private R2 storage is not configured");
  return { bucket, client: new S3Client({ endpoint, region: "auto", credentials: { accessKeyId, secretAccessKey } }) };
}

function validKey(key: string) {
  if (!/^consolidated-invoices\/[1-9]\d*\/[1-9]\d*-[0-9a-f-]{36}\.pdf$/.test(key)) throw new Error("Invalid consolidated PDF key");
}

export async function uploadConsolidatedPdf(key: string, body: Buffer) {
  validKey(key);
  const { bucket, client } = storage();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/pdf", CacheControl: "private, no-store" }));
}

export async function downloadConsolidatedPdf(key: string) {
  validKey(key);
  const { bucket, client } = storage();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error("Consolidated PDF object missing");
  return Buffer.from(await object.Body.transformToByteArray());
}

export async function deleteConsolidatedPdf(key: string) {
  validKey(key);
  const { bucket, client } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
