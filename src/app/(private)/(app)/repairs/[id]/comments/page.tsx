import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseRepairCommentId } from "@/lib/repair-comments";
import { RepairCommentsEntry } from "@/components/repairs/RepairCommentsEntry";

export const dynamic = "force-dynamic";

export default async function RepairCommentsPage({ params }: { params: Promise<{ id: string }> }) {
  const repairId = parseRepairCommentId((await params).id);
  if (repairId === null) notFound();
  const repair = await prisma.repair.findUnique({
    where: { id: repairId },
    select: { inquiryNumber: true, watch: { select: { brand: { select: { name: true, nameJp: true } }, model: { select: { name: true, nameJp: true } }, modelNameInput: true } } },
  });
  if (!repair) notFound();
  return <RepairCommentsEntry repairId={repairId} inquiryNumber={repair.inquiryNumber} brand={repair.watch.brand.nameJp || repair.watch.brand.name} model={repair.watch.model?.nameJp || repair.watch.model?.name || repair.watch.modelNameInput || ""} />;
}
