"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveAuthContext } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeGhanaPhone } from "@/lib/validation/ghana-phone";

export type StaffActionState = { message?: string; success?: boolean };

const staffRoles = ["admin", "manager", "cashier", "stock_assistant"] as const;
const staffAccountSchema = z.object({
  email: z.email().trim().toLowerCase(),
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .transform((input, context) => {
      if (!input) return null;
      const normalized = normalizeGhanaPhone(input);
      if (!normalized) {
        context.addIssue({
          code: "custom",
          message: "Enter a valid Ghana phone number.",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  role: z.enum(staffRoles),
});

export async function createStaffAccount(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const parsed = staffAccountSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { message: "Enter a valid email, name, Ghana phone number, and staff role." };
  }

  const client = await createClient();
  const actor = await resolveAuthContext(client);
  if (actor?.type !== "staff") {
    return { message: "Only an active administrator can create staff accounts." };
  }

  const { data: canManageStaff, error: permissionError } = await client.rpc(
    "has_permission",
    { requested_permission: "manage_staff" },
  );
  if (permissionError || canManageStaff !== true) {
    return { message: "Only an active administrator can create staff accounts." };
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (createError || !created.user) {
    return {
      message: "We could not create this staff account. Check the email and try again.",
    };
  }

  const { error: profileError } = await client.rpc("assign_staff_profile", {
    target_user_id: created.user.id,
    profile_name: parsed.data.fullName,
    profile_phone: parsed.data.phone ?? "",
    assigned_role: parsed.data.role,
    active: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      message: "We could not assign this staff profile. No account was retained.",
    };
  }

  revalidatePath("/staff");
  return {
    success: true,
    message:
      "Staff account created. Ask the staff member to use Forgot password to set a password.",
  };
}
