import Stripe from "stripe";
import type { RefundGateway } from "./payment-refund";
import type { CancelCheckoutGateway } from "./prepayment-cancel";

export function paymentStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

export function stripeRefundGateway(stripe: Stripe): RefundGateway {
  return {
    create: (params, key) => stripe.refunds.create(params, { idempotencyKey: key }),
    retrieve: id => stripe.refunds.retrieve(id),
  };
}

export function stripeCancelGateway(stripe: Stripe): CancelCheckoutGateway {
  return {
    retrieve: id => stripe.checkout.sessions.retrieve(id),
    expire: id => stripe.checkout.sessions.expire(id),
  };
}
