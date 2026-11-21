"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveAuthContext, userHasPermission } from "@/lib/auth/authorization";
import { sendDeliveryUpdateEmail, sendPickupReadyEmail } from "@/lib/email/notifications";
import { createClient } from "@/lib/supabase/server";

const orderIdSchema = z.uuid();
const deliveryStageSchema = z.enum(["preparing", "packed", "out_for_delivery"]);
const trackingReferenceSchema = z.string().trim().max(120);
const accraEtaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .optional();

async function authorizedOrderClient() {
  const client = await createClient();
  const actor = await resolveAuthContext(client);
  if (actor?.type !== "staff" || !(await userHasPermission("manage_orders"))) {
    return null;
  }
  return client;
}

export async function markPickupOrderReady(formData: FormData) {
  const parsedId = orderIdSchema.safeParse(formData.get("orderId"));
  if (!parsedId.success) redirect("/orders?notice=invalid");
  const client = await authorizedOrderClient();
  if (!client) redirect("/staff");

  const { error } = await client.rpc("mark_order_ready", {
    p_order_id: parsedId.data,
  });
  if (error) redirect("/orders?notice=ready_error");
  await sendPickupReadyEmail(parsedId.data);
  revalidatePath("/orders");
  revalidatePath("/account/orders");
  redirect("/orders?notice=ready");
}

export async function recordPickupCash(formData: FormData) {
  const parsedId = orderIdSchema.safeParse(formData.get("orderId"));
  if (!parsedId.success) redirect("/orders?notice=invalid");
  const client = await authorizedOrderClient();
  if (!client || !(await userHasPermission("complete_sale"))) {
    redirect("/staff");
  }

  const { error } = await client.rpc("fulfil_customer_order", {
    p_order_id: parsedId.data,
    // The order UUID provides a stable, retry-safe fulfillment operation key.
    p_client_operation_id: parsedId.data,
    p_payment_method: "cash",
  });
  if (error) redirect("/orders?notice=collect_error");
  revalidatePath("/orders");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/stock-movements");
  revalidatePath("/account/orders");
  redirect("/orders?notice=collected");
}

export async function advanceDeliveryOrder(formData: FormData) {
  const parsedId = orderIdSchema.safeParse(formData.get("orderId"));
  const parsedStage = deliveryStageSchema.safeParse(formData.get("nextStage"));
  const parsedReference = trackingReferenceSchema.safeParse(
    formData.get("trackingReference") ?? "",
  );
  const rawEta = formData.get("estimatedAt");
  const parsedEta = accraEtaSchema.safeParse(
    typeof rawEta === "string" && rawEta ? rawEta : undefined,
  );
  if (
    !parsedId.success ||
    !parsedStage.success ||
    !parsedReference.success ||
    !parsedEta.success
  ) {
    redirect("/orders?notice=delivery_invalid");
  }

  const etaDate = parsedEta.data ? new Date(`${parsedEta.data}:00Z`) : null;
  if (etaDate && Number.isNaN(etaDate.getTime())) {
    redirect("/orders?notice=delivery_invalid");
  }
  const estimatedAt = etaDate?.toISOString() ?? null;
  const client = await authorizedOrderClient();
  if (!client) redirect("/staff");

  const { error } = await client.rpc("advance_customer_delivery", {
    p_order_id: parsedId.data,
    p_next_stage: parsedStage.data,
    p_tracking_reference: parsedReference.data || null,
    p_estimated_at: estimatedAt,
  });
  if (error) redirect("/orders?notice=delivery_error");
  await sendDeliveryUpdateEmail(parsedId.data, parsedStage.data);
  revalidatePath("/orders");
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${parsedId.data}`);
  if (parsedStage.data === "packed") {
    revalidatePath("/inventory");
    revalidatePath("/stock-movements");
  }
  redirect("/orders?notice=delivery_updated");
}

export async function completeDeliveryOrder(formData: FormData) {
  const parsedId = orderIdSchema.safeParse(formData.get("orderId"));
  if (!parsedId.success) redirect("/orders?notice=invalid");
  const client = await authorizedOrderClient();
  if (!client || !(await userHasPermission("complete_sale"))) redirect("/staff");

  const { error } = await client.rpc("complete_customer_delivery", {
    p_order_id: parsedId.data,
  });
  if (error) redirect("/orders?notice=delivery_complete_error");
  await sendDeliveryUpdateEmail(parsedId.data, "delivered");
  revalidatePath("/orders");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/stock-movements");
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${parsedId.data}`);
  redirect("/orders?notice=delivery_completed");
}
