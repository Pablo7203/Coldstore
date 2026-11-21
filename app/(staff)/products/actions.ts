"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resolveAuthContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  categoryInputSchema,
  inventoryMovementInputSchema,
  normalizeMoney,
  normalizeQuantity,
  productInputSchema,
} from "@/lib/validation/catalog";

export type CatalogActionState = { message?: string; success?: boolean };

async function authorized(permission: string) {
  const client = await createClient();
  const actor = await resolveAuthContext(client);
  if (actor?.type !== "staff" || !(await userHasPermission(permission))) return null;
  return client;
}

function databaseMessage(code: string | undefined, message: string | undefined) {
  if (code === "23505")
    return "That SKU, barcode, category name, or slug is already in use.";
  if (code === "23514" && message?.includes("active product category")) {
    return "Choose an active category for this product.";
  }
  return "We could not save this change. Check the fields and try again.";
}

export async function saveCategory(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const client = await authorized("manage_products");
  if (!client) return { message: "You do not have permission to manage categories." };

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const parsed = categoryInputSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? "Check the category fields." };

  const isActive = formData.get("isActive") === "on";
  const result = categoryId
    ? await client
        .from("categories")
        .update({ ...parsed.data, is_active: isActive })
        .eq("id", categoryId)
    : await client.from("categories").insert({ ...parsed.data });

  if (result.error) {
    return { message: databaseMessage(result.error.code, result.error.message) };
  }
  revalidatePath("/products");
  revalidatePath("/inventory");
  return {
    success: true,
    message: categoryId ? "Category updated." : "Category created.",
  };
}

export async function saveProduct(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const client = await authorized("manage_products");
  if (!client) return { message: "You do not have permission to manage products." };

  const productId = String(formData.get("productId") ?? "").trim();
  const parsed = productInputSchema.safeParse({
    categoryId: formData.get("categoryId"),
    sku: formData.get("sku"),
    barcode: formData.get("barcode"),
    name: formData.get("name"),
    description: formData.get("description"),
    sellingPrice: formData.get("sellingPrice"),
    costPrice: formData.get("costPrice"),
    reorderLevel: formData.get("reorderLevel"),
  });
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? "Check the product fields." };

  const data = {
    category_id: parsed.data.categoryId,
    sku: parsed.data.sku,
    barcode: parsed.data.barcode,
    name: parsed.data.name,
    description: parsed.data.description,
    // Keep the decimal lexeme intact through JSON transport; PostgreSQL NUMERIC is authoritative.
    selling_price: normalizeMoney(parsed.data.sellingPrice) as unknown as number,
    cost_price: parsed.data.costPrice
      ? (normalizeMoney(parsed.data.costPrice) as unknown as number)
      : null,
    reorder_level: normalizeQuantity(parsed.data.reorderLevel) as unknown as number,
  };

  const result = productId
    ? await client
        .from("products")
        .update({ ...data, is_active: formData.get("isActive") === "on" })
        .eq("id", productId)
    : await client.from("products").insert(data);

  if (result.error) {
    return { message: databaseMessage(result.error.code, result.error.message) };
  }
  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/stock-movements");
  return { success: true, message: productId ? "Product updated." : "Product created." };
}

export async function recordStockMovement(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsedOperationId = z.uuid().safeParse(formData.get("operationId"));
  if (!parsedOperationId.success) return { message: "Refresh the page and try again." };

  const parsed = inventoryMovementInputSchema.safeParse({
    productId: formData.get("productId"),
    movementType: formData.get("movementType"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
    reference: formData.get("reference"),
  });
  if (!parsed.success)
    return {
      message: parsed.error.issues[0]?.message ?? "Check the stock movement fields.",
    };

  const permissionByType = {
    opening_stock: "initialize_inventory",
    receipt: "receive_stock",
    wastage: "record_wastage",
    damage: "record_damage",
    adjustment_in: "adjust_inventory",
    adjustment_out: "adjust_inventory",
  } as const;
  const permission = permissionByType[parsed.data.movementType];
  const client = await authorized(permission);
  if (!client)
    return { message: "You do not have permission to record this stock movement." };

  const { error } = await client.rpc("record_stock_movement", {
    p_product_id: parsed.data.productId,
    p_movement_type: parsed.data.movementType,
    p_quantity: normalizeQuantity(parsed.data.quantity) as unknown as number,
    ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
    ...(parsed.data.reference ? { p_reference_type: parsed.data.reference } : {}),
    p_client_operation_id: parsedOperationId.data || randomUUID(),
  });
  if (error) {
    if (error.code === "23514")
      return { message: "The movement would take stock below zero." };
    if (error.code === "23505" && error.message.includes("Opening stock")) {
      return {
        message:
          "Opening stock is already recorded. Use a stock adjustment to correct it.",
      };
    }
    if (error.code === "42501")
      return { message: "You do not have permission to record this stock movement." };
    if (error.code === "P0002") return { message: "Choose an active product." };
    return { message: "We could not record the stock movement. No balance was changed." };
  }

  revalidatePath("/inventory");
  revalidatePath("/stock-movements");
  return { success: true, message: "Stock movement recorded." };
}
