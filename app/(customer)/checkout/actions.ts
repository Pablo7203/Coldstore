"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveAuthContext } from "@/lib/auth/authorization";
import { sendOrderPlacedEmail } from "@/lib/email/notifications";
import { getServerEnvironment } from "@/lib/env";
import {
  failPaystackOrderAttempt,
  initializePaystackOrderPayment,
} from "@/lib/payments/paystack";
import { createClient } from "@/lib/supabase/server";

export type CheckoutActionState = {
  message?: string;
  success?: boolean;
  orderId?: string;
  orderNumber?: string;
  fulfillmentMethod?: "pickup" | "delivery";
  expiresAt?: string;
  subtotal?: number;
  total?: number;
  deliveryFee?: number | null;
  redirectTo?: string;
  paymentMethod?: "cash" | "paystack";
  paymentOrderId?: string;
};

const fulfillmentSchema = z.enum(["pickup", "delivery"]);
const paymentMethodSchema = z.enum(["cash", "paystack"]);
const deliveryRateSchema = z
  .string()
  .regex(/^\d{1,9}(?:\.\d{1,2})?$/)
  .transform(Number)
  .refine((fee) => Number.isFinite(fee) && fee >= 0);
const deliveryAddressSchema = z.string().trim().min(3).max(250);
const deliveryAreaSchema = z.string().trim().min(2).max(120);
const deliveryInstructionsSchema = z.string().trim().max(500);

const orderItemsSchema = z
  .array(
    z.object({
      product_id: z.uuid(),
      quantity: z.number().int().min(1).max(100),
    }),
  )
  .min(1)
  .max(50)
  .refine((items) => new Set(items.map((item) => item.product_id)).size === items.length);

export async function placeCustomerOrder(
  _previous: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const operationId = z.uuid().safeParse(formData.get("operationId"));
  const rawItems = formData.get("items");
  if (!operationId.success || typeof rawItems !== "string") {
    return { message: "Refresh your cart and try again." };
  }

  let decodedItems: unknown;
  try {
    decodedItems = JSON.parse(rawItems);
  } catch {
    return { message: "Your cart could not be read. Refresh it and try again." };
  }
  const parsedItems = orderItemsSchema.safeParse(decodedItems);
  if (!parsedItems.success) {
    return { message: "Your cart contains an invalid item or quantity." };
  }
  const method = fulfillmentSchema.safeParse(formData.get("fulfillmentMethod"));
  if (!method.success) return { message: "Choose pickup or delivery to continue." };
  const paymentMethod = paymentMethodSchema.safeParse(
    formData.get("paymentMethod") ?? "cash",
  );
  if (!paymentMethod.success) return { message: "Choose a valid payment method." };
  if (paymentMethod.data === "paystack") {
    const environment = getServerEnvironment();
    if (
      !environment.PAYSTACK_SECRET_KEY ||
      !environment.SUPABASE_SECRET_KEY ||
      !environment.NEXT_PUBLIC_SITE_URL
    ) {
      return {
        message:
          "Online payment is not available yet. Choose cash or contact the store for help.",
      };
    }
  }

  const address = deliveryAddressSchema.safeParse(formData.get("deliveryAddress"));
  const area = deliveryAreaSchema.safeParse(formData.get("deliveryArea"));
  const instructions = deliveryInstructionsSchema.safeParse(
    formData.get("deliveryInstructions") ?? "",
  );
  if (method.data === "delivery") {
    if (!address.success || !area.success || !instructions.success) {
      return {
        message:
          "Enter a valid street address and area. Instructions are limited to 500 characters.",
      };
    }
  }
  let expectedDeliveryFee = 0;
  if (method.data === "delivery") {
    const parsedRate = deliveryRateSchema.safeParse(formData.get("expectedDeliveryRate"));
    if (!parsedRate.success) {
      return {
        message:
          "The store delivery rate is not available. Refresh checkout and try again.",
      };
    }
    expectedDeliveryFee = parsedRate.data;
  }

  const client = await createClient();
  const customer = await resolveAuthContext(client);
  if (customer?.type !== "customer") {
    return { message: "Sign in with a customer account to place an order." };
  }

  const submission =
    method.data === "delivery"
      ? await client.rpc("submit_customer_delivery_order", {
          p_client_operation_id: operationId.data,
          p_items: parsedItems.data,
          p_delivery_address: address.success ? address.data : "",
          p_delivery_area: area.success ? area.data : "",
          p_expected_delivery_fee: expectedDeliveryFee,
          p_delivery_instructions:
            instructions.success && instructions.data ? instructions.data : null,
        })
      : await client.rpc("submit_customer_order", {
          p_client_operation_id: operationId.data,
          p_items: parsedItems.data,
        });
  const { data, error } = submission;
  if (error) {
    if (error.code === "55000") {
      return {
        message:
          "The store has not set its delivery rate yet. Choose store pickup or try delivery later.",
      };
    }
    if (error.code === "40001") {
      return {
        message:
          "The store delivery rate has changed. Refresh checkout to review the updated total.",
      };
    }
    if (error.code === "23514") {
      return {
        message:
          "We couldn’t reserve all the requested stock. Reduce the quantities or remove unavailable items, then try again.",
      };
    }
    if (error.code === "P0002") {
      return {
        message: "A product changed or is no longer available. Refresh your cart.",
      };
    }
    if (error.code === "42501") {
      return { message: "An active customer profile is required to place an order." };
    }
    return { message: "We couldn’t place your order. Please try again." };
  }

  const order = data?.[0];
  if (!order)
    return { message: "We couldn’t confirm your order. Please check your orders." };

  if (paymentMethod.data === "paystack") {
    const { data: attempts, error: attemptError } = await client.rpc(
      "start_paystack_order_payment",
      { p_order_id: order.order_id },
    );
    const attempt = attempts?.[0];
    if (attemptError || !attempt) {
      await sendOrderPlacedEmail(order.order_id, "paystack");
      return {
        message:
          "Your order was reserved, but we couldn’t start online payment. Review your orders or try again.",
        paymentOrderId: order.order_id,
      };
    }

    if (attempt.authorization_url) {
      await sendOrderPlacedEmail(order.order_id);
      return { redirectTo: attempt.authorization_url, paymentMethod: "paystack" };
    }

    try {
      const authorizationUrl = await initializePaystackOrderPayment({
        reference: attempt.reference,
        email: attempt.customer_email,
        amount: attempt.amount,
        orderId: order.order_id,
        orderNumber: order.order_number,
      });
      await sendOrderPlacedEmail(order.order_id);
      return { redirectTo: authorizationUrl, paymentMethod: "paystack" };
    } catch {
      await failPaystackOrderAttempt(attempt.reference).catch(() => undefined);
      await sendOrderPlacedEmail(order.order_id);
      revalidatePath("/account/orders");
      return {
        message:
          "Your order was reserved, but Paystack could not open a payment session. Check your orders and retry payment.",
        paymentOrderId: order.order_id,
      };
    }
  }

  const deliveryFee =
    "delivery_fee" in order && typeof order.delivery_fee === "number"
      ? order.delivery_fee
      : null;

  await sendOrderPlacedEmail(order.order_id);
  revalidatePath("/account");
  revalidatePath("/account/orders");
  return {
    success: true,
    message:
      method.data === "delivery"
        ? "Your delivery order is confirmed at the flat store rate shown at checkout. Pay cash when it arrives."
        : "Your pickup order is reserved. Pay with cash when you collect it.",
    paymentMethod: "cash",
    orderId: order.order_id,
    orderNumber: order.order_number,
    fulfillmentMethod: method.data,
    expiresAt: order.reservation_expires_at,
    subtotal: order.subtotal,
    total: order.total,
    deliveryFee,
  };
}

/** Reuses the customer's active Paystack session or safely starts a retry. */
export async function continuePaystackOrderPayment(formData: FormData) {
  const parsedOrderId = z.uuid().safeParse(formData.get("orderId"));
  if (!parsedOrderId.success) redirect("/account/orders?payment=review");

  const client = await createClient();
  const customer = await resolveAuthContext(client);
  if (customer?.type !== "customer") {
    redirect(
      `/login?next=${encodeURIComponent(`/account/orders?order=${parsedOrderId.data}`)}`,
    );
  }

  const { data: order, error: orderError } = await client
    .from("orders")
    .select("id, order_number, payment_method, payment_status")
    .eq("id", parsedOrderId.data)
    .eq("customer_id", customer.customerId)
    .maybeSingle();
  if (
    orderError ||
    !order ||
    order.payment_method !== "paystack" ||
    !["pending", "failed"].includes(order.payment_status)
  ) {
    redirect("/account/orders?payment=review");
  }

  const environment = getServerEnvironment();
  if (
    !environment.PAYSTACK_SECRET_KEY ||
    !environment.SUPABASE_SECRET_KEY ||
    !environment.NEXT_PUBLIC_SITE_URL
  ) {
    redirect(`/account/orders?payment=unavailable&order=${order.id}`);
  }

  const { data: attempts, error } = await client.rpc("start_paystack_order_payment", {
    p_order_id: order.id,
  });
  const attempt = attempts?.[0];
  if (error || !attempt) {
    redirect(`/account/orders?payment=review&order=${order.id}`);
  }

  let authorizationUrl = attempt.authorization_url;
  if (!authorizationUrl) {
    try {
      authorizationUrl = await initializePaystackOrderPayment({
        reference: attempt.reference,
        email: attempt.customer_email,
        amount: attempt.amount,
        orderId: order.id,
        orderNumber: order.order_number,
      });
    } catch {
      await failPaystackOrderAttempt(attempt.reference).catch(() => undefined);
      revalidatePath(`/account/orders/${order.id}`);
      revalidatePath("/account/orders");
      redirect(`/account/orders?payment=failed&order=${order.id}`);
    }
  }

  redirect(authorizationUrl);
}
