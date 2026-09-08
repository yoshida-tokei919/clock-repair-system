import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { copyRepairPhotoObjectToPublicCase, deleteRepairPhotoObject, isR2PublicCasePhotoKey, isR2RepairPhotoKey } from "@/lib/r2-repair-photos";

type ImagePhoto = {
  id: number;
  storageKey: string;
  fileName: string | null;
};

type WorkItemInput = {
  id?: number;
  displayName: string;
};

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function imagePhotoIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((id): id is number => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
}

function publicCaseImageIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((id): id is number => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
}

function sourceRepairPhotoId(url: string | null): number | null {
  const value = url?.match(/[?&]sourceRepairPhotoId=(\d+)/)?.[1];
  return value ? Number(value) : null;
}

function workItemInputs(value: unknown): WorkItemInput[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;

  const inputs: WorkItemInput[] = [];
  const existingIds = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const displayName = optionalText((item as { displayName?: unknown }).displayName);
    if (!displayName) continue;

    const id = (item as { id?: unknown }).id;
    if (id !== undefined) {
      if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || existingIds.has(id)) {
        return null;
      }
      existingIds.add(id);
    }
    inputs.push({ ...(typeof id === "number" ? { id } : {}), displayName });
  }

  return inputs;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const publicCaseId = Number(params.id);
  if (!Number.isInteger(publicCaseId) || publicCaseId <= 0) {
    return NextResponse.json({ error: "PublicCase IDが不正です。" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const action = body.action;
    if (action !== "save" && action !== "publish" && action !== "unpublish") {
      return NextResponse.json({ error: "操作が不正です。" }, { status: 400 });
    }

    const publicCase = await prisma.publicCase.findFirst({
      where: { id: publicCaseId, sourceType: "WEB_APP", repairId: { not: null } },
      select: { repairId: true, reviewStatus: true, b2cPublishStatus: true, repair: { select: { photoPostingOptOut: true } } },
    });
    if (!publicCase?.repairId) {
      return NextResponse.json({ error: "通常Repair由来のPublicCaseが見つかりません。" }, { status: 404 });
    }
    const existingImages = await prisma.publicCaseImage.findMany({
      where: { publicCaseId }, select: { id: true, storagePath: true, url: true, isPrimary: true, sortOrder: true },
    });
    const selectedPhotoIds = imagePhotoIds(body.photoIds);
    if (selectedPhotoIds === null) {
      return NextResponse.json({ error: "写真の指定が不正です。" }, { status: 400 });
    }
    if (publicCase.repair?.photoPostingOptOut && selectedPhotoIds.length > 0) {
      return NextResponse.json({ error: "お客様が事例・SNS掲載を希望していないため写真を選択できません。" }, { status: 400 });
    }

    const retainedImageIds = body.snapshotImageIds === undefined
      ? existingImages.map((image) => image.id)
      : publicCaseImageIds(body.snapshotImageIds);
    if (retainedImageIds === null) {
      return NextResponse.json({ error: "Invalid saved image IDs." }, { status: 400 });
    }

    const editedWorkItems = workItemInputs(body.workItems);
    if (editedWorkItems === null) {
      return NextResponse.json({ error: "Invalid work items." }, { status: 400 });
    }

    const repairPhotos: ImagePhoto[] = selectedPhotoIds.length
      ? await prisma.repairPhoto.findMany({
          where: {
            repairId: publicCase.repairId,
            id: { in: selectedPhotoIds },
            publicCaseVisible: true,
          },
          select: { id: true, storageKey: true, fileName: true },
        })
      : [];
    if (repairPhotos.length !== selectedPhotoIds.length) {
      return NextResponse.json({ error: "事例公開を許可していない写真は選択できません。" }, { status: 400 });
    }

    const photoById = new Map(repairPhotos.map((photo) => [photo.id, photo]));
    const orderedPhotos = selectedPhotoIds.map((id) => photoById.get(id)!);
    const primaryPhotoId = Number.isInteger(body.primaryPhotoId) ? body.primaryPhotoId : null;
    if (primaryPhotoId !== null && !selectedPhotoIds.includes(primaryPhotoId)) {
      return NextResponse.json({ error: "メイン写真は選択済み写真から指定してください。" }, { status: 400 });
    }

    const primaryImageId = Number.isInteger(body.primaryImageId) ? body.primaryImageId : null;
    const existingImageIds = new Set(existingImages.map((image) => image.id));
    if (retainedImageIds.some((id) => !existingImageIds.has(id))) {
      return NextResponse.json({ error: "Saved image does not belong to this PublicCase." }, { status: 400 });
    }
    if (primaryImageId !== null && !retainedImageIds.includes(primaryImageId)) {
      return NextResponse.json({ error: "Primary image must be a retained snapshot." }, { status: 400 });
    }
    const retainedImages = existingImages.filter((image) => retainedImageIds.includes(image.id));
    const retainedImageIdBySourcePhotoId = new Map(retainedImages.flatMap((image) => {
      const sourceId = sourceRepairPhotoId(image.url);
      return sourceId ? [[sourceId, image.id] as const] : [];
    }));
    const photosToCopy = orderedPhotos.filter((photo) => !retainedImageIdBySourcePhotoId.has(photo.id));

    const copiedObjectKeys: string[] = [];
    const publicObjectPathByPhotoId = new Map<number, string>();
    try {
      for (const photo of photosToCopy) {
        if (!isR2RepairPhotoKey(photo.storageKey)) continue;
        const storagePath = await copyRepairPhotoObjectToPublicCase({ sourceKey: photo.storageKey, publicCaseId });
        copiedObjectKeys.push(storagePath);
        publicObjectPathByPhotoId.set(photo.id, storagePath);
      }
    } catch (error) {
      await Promise.all(copiedObjectKeys.map((key) => deleteRepairPhotoObject(key).catch(() => undefined)));
      throw error;
    }

    const now = new Date();
    let replacedPublicObjectKeys: string[] = [];
    try { await prisma.$transaction(async (tx) => {
      const existingWorkItems = await tx.publicCaseWorkItem.findMany({
        where: { publicCaseId },
        select: { id: true, sortOrder: true },
      });
      const existingWorkItemIds = new Set(existingWorkItems.map((item) => item.id));
      if (editedWorkItems.some((item) => item.id !== undefined && !existingWorkItemIds.has(item.id))) {
        throw new Error("Cannot edit a work item from another PublicCase.");
      }
      const retainedWorkItemIds = editedWorkItems.flatMap((item) => item.id === undefined ? [] : [item.id]);
      await tx.publicCaseWorkItem.deleteMany({
        where: { publicCaseId, ...(retainedWorkItemIds.length ? { id: { notIn: retainedWorkItemIds } } : {}) },
      });
      await Promise.all(
        editedWorkItems
          .filter((item): item is WorkItemInput & { id: number } => item.id !== undefined)
          .map((item) => tx.publicCaseWorkItem.update({
            where: { id: item.id },
            data: { b2cDisplayName: item.displayName },
          })),
      );
      const nextSortOrder = Math.max(-1, ...existingWorkItems.map((item) => item.sortOrder)) + 1;
      const isPublished = publicCase.reviewStatus === "APPROVED" && publicCase.b2cPublishStatus === "PUBLISHED";
      const newWorkItems = editedWorkItems.filter((item) => item.id === undefined);
      if (newWorkItems.length) {
        await tx.publicCaseWorkItem.createMany({
          data: newWorkItems.map((item, index) => ({
            publicCaseId,
            sourceArea: "manual",
            sourceText: item.displayName,
            normalizedSourceText: item.displayName,
            isRuleMatched: false,
            isPublishable: action === "publish" || isPublished,
            reviewStatus: action === "publish" || isPublished ? "APPROVED" : "DRAFT",
            normalizedWorkName: item.displayName,
            b2cDisplayName: item.displayName,
            showPriceB2b: false,
            showPriceB2c: false,
            sortOrder: nextSortOrder + index,
          })),
        });
      }

      const oldImages = await tx.publicCaseImage.findMany({ where: { publicCaseId }, select: { id: true, storagePath: true, url: true, isPrimary: true, sortOrder: true } });
      const deletedImages = oldImages.filter((image) => !retainedImageIds.includes(image.id));
      replacedPublicObjectKeys = deletedImages.flatMap((image) => isR2PublicCasePhotoKey(image.storagePath) ? [image.storagePath] : []);
      await tx.publicCaseImage.deleteMany({ where: { publicCaseId, ...(retainedImageIds.length ? { id: { notIn: retainedImageIds } } : {}) } });
      const createdImageIdByPhotoId = new Map<number, number>();
      if (photosToCopy.length) {
        const nextSortOrder = Math.max(-1, ...retainedImages.map((image) => image.sortOrder)) + 1;
        for (let sortOrder = 0; sortOrder < photosToCopy.length; sortOrder += 1) {
          const photo = photosToCopy[sortOrder];
          const storagePath = publicObjectPathByPhotoId.get(photo.id) ?? photo.storageKey;
          const image = await tx.publicCaseImage.create({ data: {
            publicCaseId,
            storagePath,
            url: /^https?:|^data:/i.test(storagePath) ? storagePath : null,
            altText: photo.fileName,
            isPrimary: false,
            reviewStatus:
              action === "publish" ||
              (action === "save" && publicCase.reviewStatus === "APPROVED" && publicCase.b2cPublishStatus === "PUBLISHED")
                ? "APPROVED"
                : "DRAFT",
            sortOrder: nextSortOrder + sortOrder,
          } });
          createdImageIdByPhotoId.set(photo.id, image.id);
          if (isR2PublicCasePhotoKey(storagePath)) {
            await tx.publicCaseImage.update({ where: { id: image.id }, data: { url: `/api/public-case-images/${image.id}?sourceRepairPhotoId=${photo.id}` } });
          }
        }
      }
      const primaryImageForSelectedPhoto = primaryPhotoId === null ? null : retainedImageIdBySourcePhotoId.get(primaryPhotoId) ?? createdImageIdByPhotoId.get(primaryPhotoId) ?? null;
      const primaryTargetId = primaryImageId ?? primaryImageForSelectedPhoto ?? retainedImages.find((image) => image.isPrimary)?.id ?? createdImageIdByPhotoId.values().next().value ?? retainedImages[0]?.id ?? null;
      await tx.publicCaseImage.updateMany({ where: { publicCaseId }, data: { isPrimary: false } });
      if (primaryTargetId !== null) await tx.publicCaseImage.update({ where: { id: primaryTargetId }, data: { isPrimary: true } });

      const data = {
        b2cTitle: optionalText(body.b2cTitle),
        b2cSummary: optionalText(body.b2cSummary) ?? Prisma.JsonNull,
        showPriceB2c: false,
        ...(action === "publish"
          ? { reviewStatus: "APPROVED" as const, b2cPublishStatus: "PUBLISHED" as const, b2cPublishedAt: now }
          : action === "unpublish"
            ? { reviewStatus: "DRAFT" as const, b2cPublishStatus: "HIDDEN" as const, b2cPublishedAt: null }
            : {}),
      };
      await tx.publicCase.update({ where: { id: publicCaseId }, data });

      if (action === "publish") {
        await tx.publicCaseWorkItem.updateMany({
          where: { publicCaseId },
          data: { isPublishable: true, reviewStatus: "APPROVED" },
        });
        await tx.publicCasePartItem.updateMany({
          where: { publicCaseId },
          data: { reviewStatus: "APPROVED" },
        });
      }
    }); } catch (error) {
      await Promise.all(copiedObjectKeys.map((key) => deleteRepairPhotoObject(key).catch(() => undefined)));
      throw error;
    }
    await Promise.all(replacedPublicObjectKeys.map((key) => deleteRepairPhotoObject(key).catch((error) => console.error("PublicCase R2 cleanup failed", error))));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update PublicCase error:", error);
    return NextResponse.json({ error: "PublicCaseを更新できませんでした。" }, { status: 500 });
  }
}
