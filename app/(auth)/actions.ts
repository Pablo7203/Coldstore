"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveAuthContext } from "@/lib/auth/authorization";
import { phase2Diagnostic } from "@/lib/diagnostics/phase2";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/redirect-path";
import { normalizeGhanaPhone } from "@/lib/validation/ghana-phone";
import { sendWelcomeEmail } from "@/lib/email/notifications";

export type AuthActionState = { message?: string; success?: boolean };

const credentialsSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8),
});

const registrationSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().transform((phone, context) => {
    const normalizedPhone = normalizeGhanaPhone(phone);
    if (!normalizedPhone) {
      context.addIssue({ code: "custom", message: "Enter a valid Ghana phone number." });
      return z.NEVER;
    }
    return normalizedPhone;
  }),
});

const resetSchema = z.object({ email: z.email().trim().toLowerCase() });

async function getApplicationOrigin() {
  const requestHeaders = await headers();
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const requestOrigin = requestHeaders.get("origin");

  if (configuredOrigin) return new URL(configuredOrigin).origin;
  if (requestOrigin) return new URL(requestOrigin).origin;

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return "http://localhost:3000";

  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function signIn(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const actionStarted = performance.now();
  phase2Diagnostic("signin.action.started");
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { message: "Enter a valid email and password." };

  const clientStarted = performance.now();
  const supabase = await createClient();
  phase2Diagnostic("signin.server_client.ready", clientStarted);
  const signInStarted = performance.now();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  phase2Diagnostic("signin.supabase.completed", signInStarted, error ? "error" : "ok");
  if (error) return { message: "We could not sign you in with those details." };

  // Drop signed-out storefront RSC payloads so the header reflects this session.
  revalidatePath("/", "layout");

  const contextStarted = performance.now();
  const context = await resolveAuthContext(supabase);
  phase2Diagnostic(
    "signin.auth_context.completed",
    contextStarted,
    context?.type === "staff"
      ? "staff"
      : context?.type === "customer"
        ? "customer"
        : context?.type === "inactive-staff"
          ? "inactive"
          : "unknown",
  );
  if (context?.type === "staff") {
    phase2Diagnostic("signin.redirect.staff", actionStarted);
    redirect("/staff");
  }
  if (context?.type === "customer") {
    phase2Diagnostic("signin.redirect.customer", actionStarted);
    redirect(safeRedirectPath(String(formData.get("next") ?? ""), "/account"));
  }

  await supabase.auth.signOut();
  return {
    message:
      context?.type === "inactive-staff"
        ? "This staff account is inactive. Contact the administrator."
        : "This account does not have an active Grand Pa profile.",
  };
}

export async function signUpCustomer(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registrationSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { message: "Enter your name, a valid phone number, email, and password." };
  }

  const supabase = await createClient();
  const origin = await getApplicationOrigin();
  const destination = safeRedirectPath(String(formData.get("next") ?? ""), "/account");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        account_type: "customer",
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
      },
      emailRedirectTo:
        origin + "/auth/callback?event=signup&next=" + encodeURIComponent(destination),
    },
  });

  if (error) {
    return {
      message: "We could not complete registration. Check the details and try again.",
    };
  }
  if (data.session) {
    if (data.user?.email) {
      await sendWelcomeEmail({
        userId: data.user.id,
        email: data.user.email,
        fullName: parsed.data.fullName,
      });
    }
    revalidatePath("/", "layout");
    redirect(destination);
  }

  return {
    success: true,
    message:
      "If registration can be completed, check your email for a confirmation link.",
  };
}

export async function requestPasswordReset(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { message: "Enter a valid email address." };

  const supabase = await createClient();
  const origin = await getApplicationOrigin();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=%2Freset-password`,
  });

  return {
    success: true,
    message:
      "If an account exists for that email, a password reset link will arrive shortly.",
  };
}

export async function setNewPassword(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = z.string().min(8).safeParse(formData.get("password"));
  const confirmation = z.string().min(8).safeParse(formData.get("confirmation"));
  if (!password.success || !confirmation.success) {
    return { message: "Use a password with at least 8 characters." };
  }
  if (password.data !== confirmation.data) {
    return { message: "The passwords do not match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub)
    return { message: "Open the password reset link again." };

  const { error: updateError } = await supabase.auth.updateUser({
    password: password.data,
  });
  if (updateError) return { message: "We could not update the password. Try again." };

  redirect("/account");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
