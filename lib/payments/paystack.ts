import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnvironment } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

type PaystackEnvelope<T> = {
  status: boolean;
  message: string;
  data: T;
};

type PaystackTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
};

type PaystackAttempt = {
  order_id: string;
  amount: number;
  currency: string;
  customer_email: string;
  status: string;
};

function requirePaystackSecret() {
  const secret = getServerEnvironment().PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("Paystack is not configured on this server.");
  return secret;
}

async function paystackRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${requirePaystackSecret()}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  const result = (await response.json()) as PaystackEnvelope<T>;
  if (!response.ok || !result.status) {
    throw new Error(result.message || "Paystack could not process this request.");
  }
  return result.data;
}

export async function initializePaystackOrderPayment({
  reference,
  email,
  amount,
  orderId,
  orderNumber,
}: {
  reference: string;
  email: string;
  amount: number;
  orderId: string;
  orderNumber: string;
}) {
  const amountMinor = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
    throw new Error("The order total cannot be sent to Paystack.");
  }

  const siteUrl = getServerEnvironment().NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) throw new Error("The public site URL is not configured.");

  const callbackUrl = new URL("/api/payments/paystack/callback", siteUrl).toString();
  const transaction = await paystackRequest<{
    authorization_url: string;
    reference: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount: amountMinor,
      currency: "GHS",
      reference,
      callback_url: callbackUrl,
      metadata: { order_id: orderId, order_number: orderNumber },
    }),
  });

  const authorizationUrl = new URL(transaction.authorization_url);
  if (
    authorizationUrl.protocol !== "https:" ||
    authorizationUrl.hostname !== "checkout.paystack.com" ||
    transaction.reference !== reference
  ) {
    throw new Error("Paystack returned an unexpected authorization link.");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("save_paystack_authorization_url", {
    p_reference: reference,
    p_authorization_url: authorizationUrl.toString(),
  });
  if (error) throw new Error("The secure payment session could not be saved.");

  return authorizationUrl.toString();
}

export async function findPaystackOrder(reference: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("lookup_paystack_order_attempt", {
    p_reference: reference,
  });
  if (error) throw new Error("The payment reference could not be matched to an order.");
  return (data?.[0] as PaystackAttempt | undefined) ?? null;
}

export async function verifyAndRecordPaystackPayment(reference: string) {
  const attempt = await findPaystackOrder(reference);
  if (!attempt) return { status: "unknown" as const, orderId: null };

  const transaction = await paystackRequest<PaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  if (transaction.reference !== reference) {
    throw new Error("The verified transaction reference does not match the order.");
  }

  if (transaction.status !== "success") {
    if (["failed", "abandoned"].includes(transaction.status)) {
      const admin = createAdminClient();
      const { error } = await admin.rpc("fail_paystack_order_attempt", {
        p_reference: reference,
      });
      if (error)
        throw new Error("The unsuccessful payment status could not be recorded.");
      return { status: "failed" as const, orderId: attempt.order_id };
    }
    return { status: "pending" as const, orderId: attempt.order_id };
  }

  if (transaction.currency !== attempt.currency) {
    throw new Error("The verified transaction currency does not match the order.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("confirm_paystack_order_payment", {
    p_reference: reference,
    p_amount_minor: transaction.amount,
    p_currency: transaction.currency,
  });
  if (error || !data?.[0]) {
    throw new Error("The verified payment could not be matched to the order total.");
  }

  return { status: "success" as const, orderId: data[0].order_id };
}

export function hasValidPaystackSignature(rawBody: string, signature: string | null) {
  if (!signature || !/^[a-f\d]{128}$/i.test(signature)) return false;

  const expected = createHmac("sha512", requirePaystackSecret()).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function failPaystackOrderAttempt(reference: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("fail_paystack_order_attempt", {
    p_reference: reference,
  });
  if (error) throw new Error("The unsuccessful payment could not be recorded.");
}
