"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveAuthContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const deliveryRateSchema = z
  .string()
  .regex(/^\d{1,9}(?:\.\d{1,2})?$/, "Enter a rate using up to two decimal places.")
  .transform(Number)
  .refine((rate) => Number.isFinite(rate) && rate >= 0);

export async function updateDeliveryRate(formData: FormData) {
  const parsedRate = deliveryRateSchema.safeParse(formData.get("flatFee"));
  if (!parsedRate.success) redirect("/settings/delivery?notice=invalid");

  const client = await createClient();
  const actor = await resolveAuthContext(client);
  if (actor?.type !== "staff" || !(await userHasPermission("manage_delivery_rate"))) {
    redirect("/staff");
  }

  const { error } = await client.rpc("set_delivery_rate", {
    p_flat_fee: parsedRate.data,
  });
  if (error) redirect("/settings/delivery?notice=error");

  revalidatePath("/settings/delivery");
  revalidatePath("/checkout");
  revalidatePath("/orders");
  revalidatePath("/account/orders");
  redirect("/settings/delivery?notice=saved");
}
