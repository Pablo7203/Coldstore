"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  creditAccountSchema,
  normalizeCreditMoney,
  repaymentSchema,
} from "@/lib/credit/validation";

type State = { message?: string; success?: boolean; paymentId?: string };

export async function saveCreditAccount(
  _state: State,
  formData: FormData,
): Promise<State> {
  const client = await createClient();
  const { data: allowed } = await client.rpc("has_permission", {
    requested_permission: "manage_credit",
  });
  if (!allowed)
    return { message: "Only managers and administrators can change credit accounts." };
  const parsed = creditAccountSchema.safeParse({
    customerId: formData.get("customerId"),
    creditLimit: formData.get("creditLimit"),
    status: formData.get("status"),
  });
  if (!parsed.success)
    return {
      message: parsed.error.issues[0]?.message ?? "Check the credit account fields.",
    };
  const { error } = await client.rpc("manage_credit_account", {
    p_customer_id: parsed.data.customerId,
    p_credit_limit: normalizeCreditMoney(parsed.data.creditLimit) as unknown as number,
    p_status: parsed.data.status,
  });
  if (error)
    return {
      message:
        error.code === "42501"
          ? "You are not authorized to manage credit accounts."
          : error.message.includes("active customer")
            ? "Credit can only be enabled for an active customer."
            : "Credit account could not be saved. Check the customer and limit.",
    };
  revalidatePath("/credit");
  revalidatePath(`/credit/${parsed.data.customerId}`);
  revalidatePath("/pos");
  return { success: true, message: "Credit account saved." };
}

export async function recordCreditRepayment(
  _state: State,
  formData: FormData,
): Promise<State> {
  const client = await createClient();
  const { data: allowed } = await client.rpc("has_permission", {
    requested_permission: "record_credit_repayment",
  });
  if (!allowed) return { message: "You are not authorized to record repayments." };
  const parsed = repaymentSchema.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    reference: formData.get("reference"),
  });
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? "Check the repayment fields." };
  const payment = await client.rpc("record_credit_repayment", {
    p_customer_id: parsed.data.customerId,
    p_amount: normalizeCreditMoney(parsed.data.amount) as unknown as number,
    p_payment_method: parsed.data.paymentMethod,
    p_client_operation_id: randomUUID(),
    p_provider_reference:
      parsed.data.paymentMethod === "external_momo"
        ? parsed.data.reference || null
        : null,
  });
  if (payment.error)
    return {
      message:
        payment.error.code === "23514"
          ? "Repayment exceeds the outstanding balance, or the account is unavailable."
          : "Repayment could not be recorded. No changes were saved.",
    };
  const row = payment.data?.[0];
  if (!row) return { message: "Repayment could not be confirmed." };
  revalidatePath("/credit");
  revalidatePath(`/credit/${parsed.data.customerId}`);
  return { success: true, paymentId: row.payment_id, message: "Repayment recorded." };
}
