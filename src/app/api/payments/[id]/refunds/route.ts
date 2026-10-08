import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPaymentRefund, PaymentRefundError } from "@/lib/payment-refund";
import { paymentStripeClient, stripeRefundGateway } from "@/lib/payment-stripe-gateway";

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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid refund request" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (input.mode !== "STRIPE" && input.mode !== "MANUAL") return Response.json({ error: "Invalid refund mode" }, { status: 400 });
    const expectedKeys = input.mode === "MANUAL" ? "amount,manualOperationKey,mode,reason" : "amount,mode,reason";
    if (Object.keys(input).sort().join(",") !== expectedKeys) {
      return Response.json({ error: `Only ${expectedKeys} are accepted for ${input.mode} refunds` }, { status: 400 });
    }
    const gateway = input.mode === "STRIPE" ? stripeRefundGateway(paymentStripeClient()) : null;
    const refund = await createPaymentRefund(prisma, gateway, {
      paymentId, amount: input.amount as number, reason: input.reason as string, mode: input.mode, adminId: admin.id,
      ...(input.mode === "MANUAL" ? { manualOperationKey: input.manualOperationKey as string } : {}),
    });
    return Response.json({ refund }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    if (error instanceof PaymentRefundError) return Response.json({ error: error.message,
      reconciliationNeeded: error.reconciliationNeeded }, { status: error.status });
    console.error("Payment refund failed", { paymentId, error });
    return Response.json({ error: "返金処理に失敗しました" }, { status: 500 });
  }
}
