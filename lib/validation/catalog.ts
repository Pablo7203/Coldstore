import { z } from "zod";

const optionalTrimmed = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || null);

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(100),
  slug: z
    .string()
    .trim()
    .min(1, "Enter a category slug.")
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
});

const moneyText = z
  .string()
  .trim()
  .regex(
    /^\d{1,10}(?:\.\d{1,2})?$/,
    "Enter a non-negative amount with up to 2 decimal places.",
  );

const quantityText = z
  .string()
  .trim()
  .regex(
    /^\d{1,9}(?:\.\d{1,3})?$/,
    "Enter a non-negative quantity with up to 3 decimal places.",
  );

export const productInputSchema = z.object({
  categoryId: z.uuid("Choose a category."),
  sku: optionalTrimmed(80),
  barcode: optionalTrimmed(100),
  name: z.string().trim().min(1, "Enter a product name.").max(160),
  description: optionalTrimmed(2000),
  sellingPrice: moneyText,
  costPrice: z
    .union([z.literal(""), moneyText])
    .optional()
    .transform((value) => value || null),
  reorderLevel: quantityText,
});

export const productFilterSchema = z.object({
  query: z.string().trim().max(100).optional(),
  categoryId: z.union([z.literal(""), z.uuid()]).optional(),
  active: z.enum(["all", "active", "inactive"]).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;

/** Return a canonical base-10 decimal string; arithmetic never uses binary floats. */
export function normalizeMoney(value: string) {
  const [whole, fraction = ""] = value.trim().split(".");
  return `${BigInt(whole).toString()}.${fraction.padEnd(2, "0")}`;
}

/** Return a canonical quantity string without converting through a JavaScript number. */
export function normalizeQuantity(value: string) {
  const [whole, fraction = ""] = value.trim().split(".");
  const normalizedFraction = fraction.padEnd(3, "0").replace(/0+$/, "");
  return normalizedFraction
    ? `${BigInt(whole).toString()}.${normalizedFraction}`
    : BigInt(whole).toString();
}

export const inventoryMovementInputSchema = z
  .object({
    productId: z.uuid("Choose a product."),
    movementType: z.enum([
      "opening_stock",
      "receipt",
      "wastage",
      "damage",
      "adjustment_in",
      "adjustment_out",
    ]),
    quantity: quantityText,
    reason: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((value) => value || null),
    reference: optionalTrimmed(80),
  })
  .superRefine((value, context) => {
    const [whole, fraction = ""] = value.quantity.split(".");
    if (BigInt(whole) === BigInt(0) && /^0*$/.test(fraction)) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Quantity must be greater than zero.",
      });
    }
    if (
      ["wastage", "damage", "adjustment_in", "adjustment_out"].includes(
        value.movementType,
      ) &&
      !value.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Enter a reason for this movement.",
      });
    }
  });

export type InventoryMovementInput = z.infer<typeof inventoryMovementInputSchema>;

export function normalizeSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
