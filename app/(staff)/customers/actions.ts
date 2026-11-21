"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { customerUpdateSchema } from "@/lib/validation/customer";

export async function updateCustomer(formData: FormData) {
  const client = await createClient();
  const { data: allowed } = await client.rpc("has_permission", {
    requested_permission: "manage_customers",
  });
  if (!allowed) return { error: "You do not have permission to manage customers." };
  const id = String(formData.get("id") ?? "");
  const parsed = customerUpdateSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? "",
    status: formData.get("status"),
  });
  if (!zUuid(id) || !parsed.success)
    return {
      error: parsed.success ? "Customer not found." : parsed.error.issues[0]?.message,
    };
  const { error } = await client
    .from("customers")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      email: parsed.data.email?.toLowerCase() || null,
      notes: parsed.data.notes || null,
      status: parsed.data.status,
    })
    .eq("id", id);
  if (error)
    return {
      error:
        error.code === "23505"
          ? "That email is already used by another customer."
          : "Customer could not be updated.",
    };
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}/edit`);
  return { success: true };
}

function zUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
