import "server-only";

import { getServerEnvironment } from "@/lib/env";
import {
  createDeliveryUpdateEmail,
  createOrderPaidEmail,
  createOrderPlacedEmail,
  createPickupReadyEmail,
  createWelcomeEmail,
  type DeliveryEmailStage,
  type OrderEmailDetails,
} from "@/lib/email/templates";
import { isTransactionalEmailConfigured, sendTransactionalEmail } from "@/lib/email/smtp";
import { createAdminClient } from "@/lib/supabase/admin";

type LoadedOrderDetails = OrderEmailDetails & { email: string };

function getSiteUrl() {
  const configuredUrl = getServerEnvironment().NEXT_PUBLIC_SITE_URL;
  try {
    return new URL(configuredUrl || "http://localhost:3000").origin;
  } catch {
    return "http://localhost:3000";
  }
}

async function loadOrderDetails(
  orderId: string,
  paymentMethodOverride?: "cash" | "paystack",
): Promise<LoadedOrderDetails | null> {
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      "id, order_number, customer_id, fulfillment_method, payment_method, payment_status, delivery_address, delivery_area, delivery_fee, delivery_tracking_reference, delivery_estimated_at, subtotal, total",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error("The order could not be loaded for email.");
  if (!order) return null;

  const [customerResult, itemsResult] = await Promise.all([
    admin
      .from("customers")
      .select("full_name, email")
      .eq("id", order.customer_id)
      .maybeSingle(),
    admin
      .from("order_items")
      .select("product_name_snapshot, quantity, line_total")
      .eq("order_id", order.id)
      .order("id"),
  ]);
  if (customerResult.error || itemsResult.error) {
    throw new Error("Order email details could not be loaded.");
  }
  const customer = customerResult.data;
  if (!customer?.email) return null;

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    customerName: customer.full_name,
    email: customer.email,
    items: (itemsResult.data ?? []).map((item) => ({
      name: item.product_name_snapshot,
      quantity: item.quantity,
      lineTotal: item.line_total,
    })),
    fulfillmentMethod: order.fulfillment_method,
    paymentMethod: paymentMethodOverride ?? order.payment_method,
    paymentStatus: order.payment_status,
    deliveryAddress: order.delivery_address,
    deliveryArea: order.delivery_area,
    deliveryFee: order.delivery_fee,
    trackingReference: order.delivery_tracking_reference,
    estimatedAt: order.delivery_estimated_at,
    subtotal: order.subtotal,
    total: order.total,
    siteUrl: getSiteUrl(),
  };
}

async function sendOrderNotification(
  event: string,
  orderId: string,
  idempotencyKey: string,
  createTemplate: (details: OrderEmailDetails) => {
    subject: string;
    html: string;
    text: string;
  },
  paymentMethodOverride?: "cash" | "paystack",
) {
  if (!isTransactionalEmailConfigured()) {
    console.info("[email] " + event + " skipped: email provider is not configured");
    return;
  }

  try {
    const details = await loadOrderDetails(orderId, paymentMethodOverride);
    if (!details) {
      console.info("[email] " + event + " skipped: customer email is unavailable");
      return;
    }
    const template = createTemplate(details);
    await sendTransactionalEmail(event, {
      to: details.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey,
    });
  } catch {
    // Notification failures must never undo an already committed order action.
    console.error("[email] " + event + " could not be prepared");
  }
}

export async function sendWelcomeEmail({
  userId,
  email,
  fullName,
}: {
  userId: string;
  email: string;
  fullName: string;
}) {
  const event = "customer welcome";
  if (!isTransactionalEmailConfigured()) {
    console.info("[email] " + event + " skipped: email provider is not configured");
    return;
  }

  try {
    const template = createWelcomeEmail(fullName, getSiteUrl() + "/shop");
    await sendTransactionalEmail(event, {
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey: "customer-welcome-" + userId,
    });
  } catch {
    console.error("[email] " + event + " could not be prepared");
  }
}

export function sendOrderPlacedEmail(
  orderId: string,
  paymentMethodOverride?: "cash" | "paystack",
) {
  return sendOrderNotification(
    "order placed",
    orderId,
    "order-placed-" + orderId,
    createOrderPlacedEmail,
    paymentMethodOverride,
  );
}

export function sendOrderPaidEmail(orderId: string) {
  return sendOrderNotification(
    "payment confirmed",
    orderId,
    "payment-confirmed-" + orderId,
    createOrderPaidEmail,
  );
}

export function sendDeliveryUpdateEmail(orderId: string, stage: DeliveryEmailStage) {
  return sendOrderNotification(
    "delivery " + stage,
    orderId,
    "delivery-" + orderId + "-" + stage,
    (details) => createDeliveryUpdateEmail(details, stage),
  );
}

export function sendPickupReadyEmail(orderId: string) {
  return sendOrderNotification(
    "pickup ready",
    orderId,
    "pickup-ready-" + orderId,
    createPickupReadyEmail,
  );
}
