import Stripe from "stripe";
import { randomUUID } from "node:crypto";

import { calculateInvoicePaymentSummary, createInvoicePayment } from "@/lib/invoice-payment";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingAttempt = {
  id: number;
  idempotencyKey: string;
  checkoutSessionId: string | null;
  checkoutOrigin: string;
  createdAt: Date;
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

function configuredCheckoutOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function ensurePendingStripeAttempt(paymentId: number, origin: string | null): Promise<PendingAttempt> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
    if (rows.length !== 1) throw new Error("決済情報が見つかりません");
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: {
        kind: true,
        provider: true,
        method: true,
        status: true,
        attempts: {
          select: {
            id: true,
            provider: true,
            status: true,
            idempotencyKey: true,
            checkoutSessionId: true,
            checkoutOrigin: true,
            createdAt: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!payment || payment.kind !== "INVOICE" || payment.provider !== "STRIPE"
      || payment.method !== "CARD" || payment.status !== "PENDING") {
      throw new Error("決済状態が変わりました");
    }
    if (payment.attempts.length > 1
      || payment.attempts.some(attempt => attempt.provider !== "STRIPE" || attempt.status !== "PENDING")) {
      throw new Error("決済履歴が不整合です");
    }
    const current = payment.attempts[0];
    if (current) {
      if (!current.checkoutOrigin) throw new Error("決済ページの作成条件を確認できません");
      return {
        id: current.id,
        idempotencyKey: current.idempotencyKey,
        checkoutSessionId: current.checkoutSessionId,
        checkoutOrigin: current.checkoutOrigin,
        createdAt: current.createdAt,
      };
    }
    if (!origin) throw new Error("決済ページの戻り先を設定できません");
    const created = await tx.paymentAttempt.create({
      data: { paymentId, provider: "STRIPE", status: "PENDING", idempotencyKey: randomUUID(), checkoutOrigin: origin },
      select: { id: true, idempotencyKey: true, checkoutSessionId: true, checkoutOrigin: true, createdAt: true },
    });
    if (!created.checkoutOrigin) throw new Error("決済ページの戻り先を保存できません");
    return { ...created, checkoutOrigin: created.checkoutOrigin };
  });
}

async function expirePendingPayment(paymentId: number, attemptId: number) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    const attempt = await tx.paymentAttempt.findUnique({ where: { id: attemptId }, select: { paymentId: true, status: true } });
    if (payment?.status !== "PENDING" || attempt?.status !== "PENDING" || attempt.paymentId !== paymentId) {
      throw new Error("決済状態が変わりました");
    }
    await tx.paymentAttempt.update({ where: { id: attemptId }, data: { status: "CANCELED" } });
    await tx.payment.update({ where: { id: paymentId }, data: { status: "CANCELED" } });
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token?.trim();
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
          releases: { select: { amount: true } },
          payment: {
            select: {
              id: true,
              amount: true,
              kind: true,
              provider: true,
              status: true,
              refunds: { select: { amount: true, status: true } },
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
  const summary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations);
  const outstanding = summary.outstandingBalance;
  if (summary.invoiceRefundPendingAmount > 0) return errorResponse("返金処理中のため決済を開始できません。", 409);
  if (outstanding <= 0) return errorResponse("この請求に未払い金額はありません。");

  const checkoutInvoice = invoice;
  const currentOrigin = configuredCheckoutOrigin();
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "オンライン決済は現在利用できません。", 503);
  }

  async function createOrRecoverCheckoutSession(
    payment: { id: number; amount: number },
    attempt: PendingAttempt,
  ) {
    if (!Number.isFinite(attempt.createdAt.getTime())
      || Date.now() - attempt.createdAt.getTime() >= 23 * 60 * 60 * 1000) {
      return errorResponse("決済ページの結果を手動で照合してください。", 409);
    }
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        currency: "jpy",
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "jpy",
            unit_amount: payment.amount,
            product_data: {
              name: "時計修理代金 ご請求",
              description: `請求番号: ${checkoutInvoice.invoiceNumber}`,
            },
          },
          quantity: 1,
        }],
        metadata: {
          invoiceId: String(checkoutInvoice.id),
          invoiceNumber: checkoutInvoice.invoiceNumber,
          paymentId: String(payment.id),
          paymentAttemptId: String(attempt.id),
        },
        success_url: `${attempt.checkoutOrigin}/customer/invoices/${encodeURIComponent(token)}?checkout=success`,
        cancel_url: `${attempt.checkoutOrigin}/customer/invoices/${encodeURIComponent(token)}?checkout=cancel`,
      }, { idempotencyKey: attempt.idempotencyKey });

      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          checkoutSessionId: session.id,
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        },
      });
      if (session.payment_status === "paid" || session.status === "complete" || session.status !== "open" || !session.url) {
        return errorResponse("決済状態を確認中です。しばらくしてから再読み込みしてください。", 409);
      }
      return Response.json({ url: session.url });
    } catch (error) {
      console.error("Stripe Checkout Session creation/reconciliation failed", {
        invoiceId: checkoutInvoice.id,
        paymentId: payment.id,
        paymentAttemptId: attempt.id,
        error,
      });
      return errorResponse("決済ページの結果が不明です。照合が必要です。", 502);
    }
  }

  const existingPayment = invoice.paymentAllocations
    .map((allocation) => allocation.payment)
    .find((payment) => payment.provider === "STRIPE" && payment.status === "PENDING");
  if (existingPayment && (existingPayment.kind !== "INVOICE" || existingPayment.amount !== outstanding)) {
    return errorResponse("請求残高が変わりました。決済状態の照合が必要です。", 409);
  }
  if (existingPayment) {
    let existingAttempt: PendingAttempt;
    try {
      existingAttempt = await ensurePendingStripeAttempt(existingPayment.id, currentOrigin);
    } catch (error) {
      console.error("Pending invoice Checkout attempt reconciliation failed", {
        invoiceId: invoice.id,
        paymentId: existingPayment.id,
        error,
      });
      return errorResponse("決済履歴が不整合です。決済状態の照合が必要です。", 409);
    }
    if (existingAttempt.checkoutSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(existingAttempt.checkoutSessionId);
        if (session.payment_status === "paid" || session.status === "complete") {
          return errorResponse("決済結果を確認中です。しばらくしてから請求画面を再読み込みしてください。", 409);
        }
        if (session.status === "open" && session.url) return Response.json({ url: session.url });
        if (session.status !== "expired") return errorResponse("決済状態を確認できません。", 409);
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
    } else {
      return createOrRecoverCheckoutSession(existingPayment, existingAttempt);
    }
  }

  if (!currentOrigin) return errorResponse("オンライン決済は現在利用できません。", 503);

  let payment: { id: number; amount: number };
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

  let attempt: PendingAttempt;
  try {
    attempt = await ensurePendingStripeAttempt(payment.id, currentOrigin);
  } catch (error) {
    console.error("Invoice Checkout attempt reservation failed", { invoiceId: invoice.id, paymentId: payment.id, error });
    return errorResponse("決済ページを準備できません。決済状態の照合が必要です。", 409);
  }
  return createOrRecoverCheckoutSession(payment, attempt);
}
