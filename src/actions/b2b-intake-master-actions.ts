"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !await prisma.admin.findUnique({
    where: { email: session.user.email }, select: { id: true },
  })) throw new Error("管理者認証が必要です。");
}

export async function getB2bBrandMasters(brandId: number) {
  await requireAdmin();
  if (!Number.isSafeInteger(brandId) || brandId <= 0) throw new Error("ブランドが不正です。");
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, isWatchBrand: true, brandKind: { not: "TYPE" } }, select: { id: true },
  });
  if (!brand) throw new Error("時計ブランドが見つかりません。");
  const [models, calibers] = await Promise.all([
    prisma.model.findMany({ where: { brandId }, select: { id: true, name: true, nameEn: true, nameJp: true }, orderBy: { nameJp: "asc" } }),
    prisma.caliber.findMany({ where: { brandId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { models, calibers };
}

export async function getB2bModelMasters(brandId: number, modelId: number) {
  await requireAdmin();
  if (!Number.isSafeInteger(brandId) || !Number.isSafeInteger(modelId) || brandId <= 0 || modelId <= 0) {
    throw new Error("モデルが不正です。");
  }
  const model = await prisma.model.findFirst({
    where: { id: modelId, brandId, brand: { isWatchBrand: true, brandKind: { not: "TYPE" } } },
    select: { id: true },
  });
  if (!model) throw new Error("選択したブランドのモデルが見つかりません。");
  const [refs, refCalibers, partsCalibers, pricingCalibers] = await Promise.all([
    prisma.watchReference.findMany({
      where: { modelId }, select: { id: true, name: true, caliber: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.watchReference.findMany({
      where: { modelId, caliberId: { not: null } }, select: { caliberId: true }, distinct: ["caliberId"],
    }),
    prisma.partsMaster.findMany({
      where: { brandId, modelId, caliberId: { not: null } }, select: { caliberId: true }, distinct: ["caliberId"],
    }),
    prisma.pricingRule.findMany({
      where: { brandId, modelId, caliberId: { not: null } }, select: { caliberId: true }, distinct: ["caliberId"],
    }),
  ]);
  const caliberIds = [...new Set([
    ...refCalibers.map((ref) => ref.caliberId as number),
    ...partsCalibers.map((part) => part.caliberId as number),
    ...pricingCalibers.map((rule) => rule.caliberId as number),
  ])];
  const calibers = await prisma.caliber.findMany({
    where: caliberIds.length ? { id: { in: caliberIds } } : { brandId },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  return { refs, calibers };
}
