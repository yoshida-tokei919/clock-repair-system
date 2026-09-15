import Stripe from "stripe";
import { randomUUID } from "node:crypto";

import { calculateInvoicePaymentSummary, createInvoicePayment } from "@/lib/invoice-payment";
import { prisma } from "@/lib/prisma";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingAttempt = {
  id: number;
  checkoutSessionId: string | null;
};

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("オンライン決済は現在利用できません。時間をおいてお試しください。");
  }
  return new Stripe(secretKey);
}

async function expirePendingPayment(paymentId: number, attemptId: number) {
  await prisma.$transaction([
    prisma.paymentAttempt.update({ where: { id: attemptId }, data: { status: "CANCELED" } }),
    prisma.payment.update({ where: { id: paymentId }, data: { status: "CANCELED" } }),
  ]);
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const token = params.token?.trim();
  if (!token) return errorResponse("請求情報が見つかりません。", 404);

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      invoiceNumber: true,
      customerId: true,
      grossTotalAmount: true,
      status: true,
      customer: { select: { type: true } },
      paymentAllocations: {
        select: {
          allocatedAmount: true,
          payment: {
            select: {
              id: true,
              provider: true,
              status: true,
              attempts: {
                where: { provider: "STRIPE", status: "PENDING" },
                select: { id: true, checkoutSessionId: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!invoice) return errorResponse("請求情報が見つかりません。", 404);
  if (invoice.customer.type !== "individual") return errorResponse("この請求ではオンライン決済をご利用いただけません。", 403);
  if (invoice.status !== "issued") return errorResponse("この請求はお支払いできません。");
  if (!Number.isSafeInteger(invoice.grossTotalAmount) || invoice.grossTotalAmount <= 0) {
    return errorResponse("お支払い金額を確認できません。");
  }
  if (calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations).outstandingBalance <= 0) {
    return errorResponse("この請求に未払い金額はありません。");
  }

  const origin = getRequestOrigin(request);
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "オンライン決済は現在利用できません。", 503);
  }

  const existingPayment = invoice.paymentAllocations
    .map((allocation) => allocation.payment)
    .find((payment) => payment.provider === "STRIPE" && payment.status === "PENDING");
  const existingAttempt: PendingAttempt | undefined = existingPayment?.attempts[0];
  if (existingPayment && existingAttempt?.checkoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(existingAttempt.checkoutSessionId);
      if (session.status === "open" && session.url) return Response.json({ url: session.url });
      if (session.status === "complete") {
        return errorResponse("決済結果を確認中です。しばらくしてから請求画面を再読み込みしてください。", 409);
      }
      await expirePendingPayment(existingPayment.id, existingAttempt.id);
    } catch (error) {
      console.error("Stripe Checkout Session retrieval failed", {
        invoiceId: invoice.id,
        paymentId: existingPayment.id,
        paymentAttemptId: existingAttempt.id,
        error,
      });
      return errorResponse("決済ページの確認に失敗しました。時間をおいてお試しください。", 502);
    }
  } else if (existingPayment) {
    return errorResponse("決済ページを準備中です。しばらくしてから再度お試しください。", 409);
  }

  let payment: { id: number };
  try {
    payment = await createInvoicePayment(prisma, {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      provider: "STRIPE",
      method: "CARD",
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "決済を開始できません。");
  }

  const idempotencyKey = randomUUID();
  const attempt = await prisma.paymentAttempt.create({
    data: { paymentId: payment.id, provider: "STRIPE", status: "PENDING", idempotencyKey },
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "jpy",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "jpy",
          unit_amount: invoice.grossTotalAmount,
          product_data: {
            name: "時計修理代金 ご請求",
            description: `請求番号: ${invoice.invoiceNumber}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        invoiceId: String(invoice.id),
        invoiceNumber: invoice.invoiceNumber,
        paymentId: String(payment.id),
        paymentAttemptId: String(attempt.id),
      },
      success_url: `${origin}/customer/invoices/${encodeURIComponent(token)}?checkout=success`,
      cancel_url: `${origin}/customer/invoices/${encodeURIComponent(token)}?checkout=cancel`,
    }, { idempotencyKey });

    if (!session.url) throw new Error("Stripe Checkout URL was not returned");
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { checkoutSessionId: session.id, paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null },
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout Session creation failed", {
      invoiceId: invoice.id,
      paymentId: payment.id,
      paymentAttemptId: attempt.id,
      error,
    });
    await prisma.$transaction([
      prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED" } }),
      prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }),
    ]);
    return errorResponse("決済ページの作成に失敗しました。時間をおいてお試しください。", 502);
  }
}
