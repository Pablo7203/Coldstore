"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ConflictActionState = { message?: string; success?: boolean };

const resolutionSchema = z.object({
  operationId: z.uuid(),
  resolution: z.enum(["accept", "void"]),
  note: z.string().trim().min(3).max(1000),
});

export async function resolveOfflinePosOperation(
  _previousState: ConflictActionState,
  formData: FormData,
): Promise<ConflictActionState> {
  const parsed = resolutionSchema.safeParse({
    operationId: formData.get("operationId"),
    resolution: formData.get("resolution"),
    note: formData.get("note"),
  });
  if (!parsed.success)
    return { message: "Enter a review note of at least 3 characters." };

  const client = await createClient();
  const { error } = await client.rpc("resolve_offline_pos_operation", {
    p_operation_id: parsed.data.operationId,
    p_resolution: parsed.data.resolution,
    p_note: parsed.data.note,
  });
  if (error) {
    const message = error.message.toLowerCase().includes("reconcile stock")
      ? "Reconcile stock or release the affected reservation, then try accepting the sale again."
      : error.message.toLowerCase().includes("reconcile the catalogue")
        ? "Reactivate the product before accepting this sale, then retry the review."
        : error.code === "42501"
          ? "Your role cannot resolve offline sales."
          : "The offline sale could not be resolved. Check its status and try again.";
    return { message };
  }

  revalidatePath("/offline-conflicts");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return {
    success: true,
    message:
      parsed.data.resolution === "accept"
        ? "Sale accepted and recorded in the sales and inventory ledgers."
        : "Sale marked void with the review note preserved.",
  };
}
