import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reconcilePaymentRefund, PaymentRefundError } from "@/lib/payment-refund";
import { paymentStripeClient, stripeRefundGateway } from "@/lib/payment-stripe-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const admin = session?.user?.email ? await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } }) : null;
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rawId = (await params).id;
  const refundId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(refundId)) return Response.json({ error: "Invalid Refund ID" }, { status: 400 });
  try {
    const refund = await reconcilePaymentRefund(prisma, stripeRefundGateway(paymentStripeClient()), refundId);
    return Response.json({ refund });
  } catch (error) {
    if (error instanceof PaymentRefundError) return Response.json({ error: error.message,
      reconciliationNeeded: error.reconciliationNeeded }, { status: error.status });
    console.error("Payment refund reconciliation failed", { refundId, error });
    return Response.json({ error: "返金照合に失敗しました" }, { status: 500 });
  }
}
