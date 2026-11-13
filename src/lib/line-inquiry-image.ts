import "server-only";

import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import {
  inquiryFileBucketName,
  inquiryFileObjectKey,
  uploadInquiryFileObject,
} from "@/lib/r2-inquiry-files";

export type LineInquiryImageDb = Pick<PrismaClient, "inquiryFile">;

const MAX_LINE_IMAGE_BYTES = 20 * 1024 * 1024;

export async function readLineImageStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_LINE_IMAGE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error("LINE image exceeds the allowed size.");
    }
    chunks.push(part.value);
  }
  if (size === 0) throw new Error("LINE image is empty.");
  return Buffer.concat(chunks, size);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

async function downloadLineImage(messageId: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE channel access token is not configured.");

  const response = await fetch(
    `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`LINE image download failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("LINE message content is not an image.");
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_LINE_IMAGE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error("LINE image exceeds the allowed size.");
  }

  if (!response.body) throw new Error("LINE image response has no body.");
  return readLineImageStream(response.body);
}

export async function prepareInquiryImage(body: Buffer) {
  const { data, info } = await sharp(body)
    .rotate()
    .resize({
      width: 3000,
      height: 3000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  return {
    body: data,
    mimeType: "image/webp",
    fileSize: data.length,
    width: info.width,
    height: info.height,
  };
}

export async function handleLineInquiryImage(
  db: LineInquiryImageDb,
  input: {
    inquiryId: number;
    inquiryMessageId: number;
    externalMessageId: string;
    receivedAt: Date;
  },
) {
  let file = await db.inquiryFile.findUnique({
    where: {
      provider_providerFileId: {
        provider: "LINE",
        providerFileId: input.externalMessageId,
      },
    },
  });

  if (file?.uploadStatus === "STORED") return file;

  const bucket = inquiryFileBucketName();

  if (!file) {
    try {
      file = await db.inquiryFile.create({
        data: {
          inquiryId: input.inquiryId,
          inquiryMessageId: input.inquiryMessageId,
          provider: "LINE",
          providerFileId: input.externalMessageId,
          bucket,
          objectKey: inquiryFileObjectKey(input.receivedAt),
          uploadStatus: "PENDING",
        },
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        file = await db.inquiryFile.findUnique({
          where: {
            provider_providerFileId: {
              provider: "LINE",
              providerFileId: input.externalMessageId,
            },
          },
        });
      } else {
        throw error;
      }
    }
  }

  if (!file) {
    throw new Error("Inquiry file record could not be created.");
  }
  if (file.bucket !== bucket) {
    throw new Error("Inquiry file bucket does not match current configuration.");
  }

  if (file.uploadStatus === "FAILED") {
    const reset = await db.inquiryFile.updateMany({
      where: { id: file.id, uploadStatus: "FAILED" },
      data: {
        uploadStatus: "PENDING",
        lastError: null,
      },
    });

    if (reset.count === 0) {
      const latest = await db.inquiryFile.findUnique({ where: { id: file.id } });
      if (latest?.uploadStatus === "STORED") return latest;
      if (latest) file = latest;
    } else {
      file = { ...file, uploadStatus: "PENDING", lastError: null };
    }
  }

  try {
    const source = await downloadLineImage(input.externalMessageId);
    const prepared = await prepareInquiryImage(source);

    await uploadInquiryFileObject({
      key: file.objectKey,
      body: prepared.body,
    });

    return await db.inquiryFile.update({
      where: { id: file.id },
      data: {
        mimeType: prepared.mimeType,
        fileSize: prepared.fileSize,
        width: prepared.width,
        height: prepared.height,
        uploadStatus: "STORED",
        lastError: null,
      },
    });
  } catch (error: unknown) {
    await db.inquiryFile.updateMany({
      where: {
        id: file.id,
        uploadStatus: { not: "STORED" },
      },
      data: {
        uploadStatus: "FAILED",
        lastError: errorMessage(error),
      },
    }).catch((dbError) => {
      console.error("InquiryFile failure state save failed", dbError);
    });

    throw error;
  }
}
