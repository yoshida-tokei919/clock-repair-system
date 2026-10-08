import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRepairPrepayment, RepairPrepaymentError } from "@/lib/repair-prepayment";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } })) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rawId = (await params).id;
  const id = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id)) return Response.json({ error: "Invalid Repair ID" }, { status: 400 });
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }
  try {
    const result = await createRepairPrepayment(prisma, id, await request.json());
    return Response.json({ payment: result.payment, reused: result.reused }, { status: result.reused ? 200 : 201 });
  } catch (error) {
    if (error instanceof RepairPrepaymentError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error("Repair prepayment creation failed", { repairId: id, error });
    return Response.json({ error: "Prepayment could not be created" }, { status: 500 });
  }
}
