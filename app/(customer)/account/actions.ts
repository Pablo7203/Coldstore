"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireCustomerContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { customerInputSchema } from "@/lib/validation/customer";

export type AccountActionState = {
  message?: string;
  success?: boolean;
  updatedAt?: number;
};

const contactSchema = customerInputSchema.pick({ fullName: true, phone: true });
const emailSchema = z.email().trim().toLowerCase().max(254);

export async function updateCustomerDetails(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const customer = await requireCustomerContext();
  const parsed = contactSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { message: "Enter your name and a valid Ghana phone number." };
  }

  const client = await createClient();
  const { data, error } = await client
    .from("customers")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", customer.customerId)
    .eq("auth_user_id", customer.userId)
    .select("id")
    .single();

  if (error || !data) {
    return { message: "We could not save your details. Please try again." };
  }

  revalidatePath("/account");
  return {
    success: true,
    message: "Your name and phone number were updated.",
    updatedAt: Date.now(),
  };
}

export async function requestCustomerEmailChange(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const customer = await requireCustomerContext();
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { message: "Enter a valid email address." };

  const client = await createClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || authData.user?.id !== customer.userId) {
    return { message: "Your session expired. Sign in again to change your email." };
  }
  if (authData.user.email?.toLowerCase() === parsed.data) {
    return { message: "This is already your account email address." };
  }

  // Use the active local port during development; production uses its configured public URL.
  const requestOrigin = (await headers()).get("origin");
  const siteUrl =
    process.env.NODE_ENV === "production"
      ? process.env.NEXT_PUBLIC_SITE_URL
      : (requestOrigin ?? process.env.NEXT_PUBLIC_SITE_URL);
  if (!siteUrl) {
    return {
      message: "Email changes are temporarily unavailable. Please try again later.",
    };
  }

  const emailRedirectTo = new URL("/auth/callback?next=%2Faccount", siteUrl).toString();
  const { error } = await client.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo },
  );
  if (error) {
    return {
      message:
        "We could not send the confirmation links. Check the address and try again.",
    };
  }

  return {
    success: true,
    message: /^http:\/\/(127\.0\.0\.1|localhost):/u.test(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    )
      ? "Two confirmation links were captured by the local test inbox. Confirm both to activate your new address."
      : "Check your current and new email inboxes for confirmation links. Your current address remains active until the change is confirmed.",
    updatedAt: Date.now(),
  };
}
