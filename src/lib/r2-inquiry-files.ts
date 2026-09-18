import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

function clientConfig() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_INQUIRY_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_INQUIRY_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 inquiry credentials are not configured.");
  }

  return { endpoint, accessKeyId, secretAccessKey };
}

function client() {
  const c = clientConfig();
  return new S3Client({
    endpoint: c.endpoint,
    region: "auto",
    credentials: {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
    },
  });
}

export function inquiryFileBucketName() {
  const bucket = process.env.R2_INQUIRY_BUCKET_NAME;
  if (!bucket) throw new Error("R2 inquiry bucket is not configured.");
  return bucket;
}

export function inquiryFileObjectKey(date = new Date()) {
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `inquiries/${ym}/${randomUUID()}.webp`;
}

export function isR2InquiryFileKey(value: string | null | undefined): value is string {
  return typeof value === "string" &&
    /^inquiries\/\d{6}\/[0-9a-f-]+\.webp$/i.test(value);
}

export async function uploadInquiryFileObject(params: {
  key: string;
  body: Buffer;
}) {
  if (!isR2InquiryFileKey(params.key)) {
    throw new Error("Invalid R2 inquiry file key.");
  }

  await client().send(new PutObjectCommand({
    Bucket: inquiryFileBucketName(),
    Key: params.key,
    Body: params.body,
    ContentType: "image/webp",
    CacheControl: "private, max-age=0",
  }));
}

export async function deleteInquiryFileObject(key: string) {
  if (!isR2InquiryFileKey(key)) return;

  await client().send(new DeleteObjectCommand({
    Bucket: inquiryFileBucketName(),
    Key: key,
  }));
}

export async function getInquiryFileSignedReadUrl(
  key: string,
  expiresIn = 300,
) {
  if (!isR2InquiryFileKey(key)) {
    throw new Error("Invalid R2 inquiry file key.");
  }

  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: inquiryFileBucketName(),
      Key: key,
    }),
    { expiresIn },
  );
}
