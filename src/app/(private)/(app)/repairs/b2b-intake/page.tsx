import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { B2bBatchIntakeForm } from "./B2bBatchIntakeForm";

export const dynamic = "force-dynamic";

export default async function B2bBatchIntakePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !await prisma.admin.findUnique({
    where: { email: session.user.email }, select: { id: true },
  })) redirect("/login");

  const [partners, brands, movementMakers, movementCalibers] = await Promise.all([
    prisma.customer.findMany({
      where: { type: "business", isPartner: true },
      select: { id: true, name: true, companyName: true, prefix: true },
      orderBy: { companyName: "asc" },
    }),
    prisma.brand.findMany({
      where: { isWatchBrand: true, brandKind: { not: "TYPE" } },
      select: { id: true, name: true, nameJp: true, nameEn: true, kana: true,
        aliases: { select: { alias: true } } }, orderBy: { nameJp: "asc" },
    }),
    prisma.brand.findMany({
      where: { isMovementMaker: true, brandKind: { not: "TYPE" } },
      select: { id: true, name: true, nameJp: true, nameEn: true, kana: true,
        aliases: { select: { alias: true } } }, orderBy: { nameJp: "asc" },
    }),
    prisma.caliber.findMany({ select: { id: true, name: true, nameJp: true, nameEn: true, brandId: true },
      orderBy: { name: "asc" } }),
  ]);
  return <B2bBatchIntakeForm partners={partners} brands={brands} movementMakers={movementMakers} movementCalibers={movementCalibers} />;
}
