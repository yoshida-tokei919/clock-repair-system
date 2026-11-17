import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentTokenIncludesRepair } from "@/lib/estimate-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await params).id.trim();
  if (!token || token.length > 256) return NextResponse.json({ error: "共有URLが不正です。" }, { status: 404 });
  const repairToken = await prisma.repair.findUnique({ where: { publicToken: token }, select: { id: true } });
  const document = repairToken ? null : await prisma.estimateDocument.findUnique({
    where: { publicToken: token }, select: { id: true, customerId: true, repairs: { select: { id: true } } },
  });
  const repairId = repairToken?.id ?? Number(new URL(request.url).searchParams.get("repairId"));
  if (!Number.isSafeInteger(repairId) || repairId < 1 || (!repairToken && !document) ||
      (document && !document.repairs.some(member => member.id === repairId))) {
    return NextResponse.json({ error: "対象案件が見つかりません。" }, { status: 404 });
  }
  const repair = await prisma.repair.findUnique({ where: { id: repairId }, select: {
    id: true, publicToken: true, customerId: true, approvalStatus: true, status: true, estimateDocumentId: true,
    customer: { select: { type: true } },
    estimateOptionApproval: { select: { pdfFileId: true, optionSourceHash: true, planChoiceId: true, addOnChoiceIds: true, approverName: true } },
  } });
  if (!repair || (repairToken && repair.publicToken !== token) ||
      (document && (repair.estimateDocumentId !== document.id || !documentTokenIncludesRepair(document, {
        id: repair.id, customerId: repair.customerId, customerType: repair.customer.type,
      })))) {
    return NextResponse.json({ error: "対象案件が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ approvalStatus: repair.approvalStatus, repairStatus: repair.status,
    optionApproval: repair.estimateOptionApproval }, { headers: { "Cache-Control": "no-store" } });
}
