import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { PrepaymentCheckoutError, startRepairPrepaymentCheckout } from "@/lib/repair-prepayment-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string; paymentId: string }> }) {
  const { token, paymentId } = await params;
  const id = /^[1-9]\d*$/.test(paymentId) ? Number(paymentId) : NaN;
  if (!Number.isSafeInteger(id) || !token?.trim()) return Response.json({ error: "Prepayment not found" }, { status: 404 });
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return Response.json({ error: "Online payment is unavailable" }, { status: 503 });
  const client = new Stripe(secret);
  // A fixed application origin keeps return URLs and Stripe idempotency parameters stable.
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  let origin: string;
  try {
    if (!configuredOrigin) throw new Error("Missing application origin");
    const url = new URL(configuredOrigin);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid application origin");
    origin = url.origin;
  } catch {
    return Response.json({ error: "Online payment is unavailable" }, { status: 503 });
  }
  try {
    const result = await startRepairPrepaymentCheckout(prisma, {
      retrieve: id => client.checkout.sessions.retrieve(id),
      create: (data, idempotencyKey) => client.checkout.sessions.create(data, { idempotencyKey }),
    }, id, token.trim(), origin);
    return Response.json(result);
  } catch (error) {
    if (error instanceof PrepaymentCheckoutError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Repair prepayment Checkout failed", { paymentId: id, error });
    return Response.json({ error: "Checkout could not be started" }, { status: 500 });
  }
}
