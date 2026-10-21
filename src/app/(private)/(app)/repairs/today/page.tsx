import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadTodayWork } from "@/lib/today-work";
import { TodayWorkView } from "@/components/repairs/TodayWorkView";

export const dynamic = "force-dynamic";

export default async function TodayWorkPage() {
  const work = await prisma.$transaction(tx => loadTodayWork(tx), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
  return <TodayWorkView work={work} />;
}
