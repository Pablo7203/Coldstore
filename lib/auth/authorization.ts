import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { phase2Diagnostic } from "@/lib/diagnostics/phase2";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const staffRoles = ["admin", "manager", "cashier", "stock_assistant"] as const;
export type StaffRole = (typeof staffRoles)[number];

export type AuthContext =
  | {
      type: "staff";
      userId: string;
      email: string | null;
      fullName: string;
      role: StaffRole;
    }
  | { type: "inactive-staff"; userId: string }
  | { type: "customer"; userId: string; fullName: string; customerId: string }
  | null;

export async function resolveAuthContext(
  client: SupabaseClient<Database>,
): Promise<AuthContext> {
  const claimsStarted = performance.now();
  const { data: claimData, error: claimError } = await client.auth.getClaims();
  phase2Diagnostic(
    "auth_context.claims.completed",
    claimsStarted,
    claimError ? "error" : "ok",
  );
  const claims = claimData?.claims;
  const userId = claims?.sub;

  if (claimError || !claims || typeof userId !== "string") return null;

  const staffQueryStarted = performance.now();
  const { data: staff, error: staffError } = await client
    .from("staff_profiles")
    .select("user_id, full_name, role, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  phase2Diagnostic(
    "auth_context.staff_profile.completed",
    staffQueryStarted,
    staffError ? "error" : "ok",
  );

  if (staffError) return null;
  if (staff) {
    if (!staff.is_active) return { type: "inactive-staff", userId };

    if (!staffRoles.includes(staff.role as StaffRole)) return null;

    return {
      type: "staff",
      userId,
      email: typeof claims.email === "string" ? claims.email : null,
      fullName: staff.full_name,
      role: staff.role as StaffRole,
    };
  }

  const customerQueryStarted = performance.now();
  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("id, full_name")
    .eq("auth_user_id", userId)
    .maybeSingle();
  phase2Diagnostic(
    "auth_context.customer_profile.completed",
    customerQueryStarted,
    customerError ? "error" : "ok",
  );

  if (customerError || !customer) return null;

  return {
    type: "customer",
    userId,
    fullName: customer.full_name,
    customerId: customer.id,
  };
}

export async function getAuthContext() {
  return resolveAuthContext(await createClient());
}

export async function requireStaffContext() {
  const context = await getAuthContext();

  if (context?.type === "staff") return context;
  if (context?.type === "customer") redirect("/account");
  redirect(context?.type === "inactive-staff" ? "/login?notice=inactive" : "/login");
}

export async function requireCustomerContext() {
  const context = await getAuthContext();

  if (context?.type === "customer") return context;
  if (context?.type === "staff") redirect("/staff");
  redirect(context?.type === "inactive-staff" ? "/login?notice=inactive" : "/login");
}

export async function userHasPermission(permission: string) {
  const client = await createClient();
  const { data, error } = await client.rpc("has_permission", {
    requested_permission: permission,
  });

  return !error && data === true;
}
