import Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { settleStripeCheckoutPayment } from "@/lib/stripe-webhook-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(secretKey);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("stripe-signature");
  if (!webhookSecret || !signature) return new Response("Invalid Stripe webhook signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", { error });
    return new Response("Invalid Stripe webhook signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") return Response.json({ received: true });
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    console.info("Stripe checkout webhook ignored because it is not paid", { eventId: event.id, checkoutSessionId: session.id });
    return Response.json({ received: true });
  }

  try {
    const result = await settleStripeCheckoutPayment(prisma, session, new Date(event.created * 1000));
    console.info("Stripe checkout payment processed", {
      eventId: event.id, eventType: event.type, checkoutSessionId: session.id,
      paymentId: "paymentId" in result ? result.paymentId : undefined,
      paymentAttemptId: "paymentAttemptId" in result ? result.paymentAttemptId : undefined,
      outcome: result.outcome,
    });
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe checkout payment processing failed", {
      eventId: event.id, eventType: event.type, checkoutSessionId: session.id, error,
    });
    return new Response("Stripe webhook processing failed", { status: 500 });
  }
}
