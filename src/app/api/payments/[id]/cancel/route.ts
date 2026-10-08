import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelPendingPrepayment, PrepaymentCancelError } from "@/lib/prepayment-cancel";
import { paymentStripeClient, stripeCancelGateway } from "@/lib/payment-stripe-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const admin = session?.user?.email ? await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } }) : null;
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rawId = (await params).id;
  const paymentId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(paymentId)) return Response.json({ error: "Invalid Payment ID" }, { status: 400 });
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join(",") !== "reason") {
      return Response.json({ error: "Only reason is accepted" }, { status: 400 });
    }
    const payment = await cancelPendingPrepayment(prisma, stripeCancelGateway(paymentStripeClient()), paymentId,
      (body as { reason: string }).reason, admin.id);
    return Response.json({ payment });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    if (error instanceof PrepaymentCancelError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Prepayment cancellation failed", { paymentId, error });
    return Response.json({ error: "前受金取消に失敗しました" }, { status: 500 });
  }
}
