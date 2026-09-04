import { notFound } from "next/navigation";

import { PublicCaseEditor } from "@/components/public-cases/PublicCaseEditor";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicCaseEditorPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const publicCase = await prisma.publicCase.findFirst({
    where: { id, sourceType: "WEB_APP", repairId: { not: null } },
    include: {
      workItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      partItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
      repair: { select: { id: true, inquiryNumber: true, photos: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!publicCase?.repair) notFound();

  return <PublicCaseEditor data={JSON.parse(JSON.stringify(publicCase))} />;
}
