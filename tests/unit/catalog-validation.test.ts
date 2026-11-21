import { describe, expect, it } from "vitest";
import {
  categoryInputSchema,
  inventoryMovementInputSchema,
  normalizeMoney,
  normalizeQuantity,
  normalizeSlug,
  productInputSchema,
} from "@/lib/validation/catalog";

const product = {
  categoryId: "2d701e4c-6dd8-47be-8e56-9d49cdff98c3",
  sku: "FROZEN-01",
  barcode: "0123456789012",
  name: "Whole Chicken",
  description: "Fictional development item",
  sellingPrice: "125.50",
  costPrice: "90.25",
  reorderLevel: "3.500",
};

describe("catalog validation", () => {
  it("accepts category data and validates normalized slugs", () => {
    expect(
      categoryInputSchema.safeParse({ name: "Frozen Poultry", slug: "frozen-poultry" })
        .success,
    ).toBe(true);
    expect(
      categoryInputSchema.safeParse({ name: "Frozen Poultry", slug: "Frozen Poultry" })
        .success,
    ).toBe(false);
    expect(categoryInputSchema.safeParse({ name: "  ", slug: "empty" }).success).toBe(
      false,
    );
  });

  it("accepts bounded product fields and decimal prices", () => {
    expect(productInputSchema.safeParse(product).success).toBe(true);
    expect(productInputSchema.safeParse({ ...product, sellingPrice: "-1" }).success).toBe(
      false,
    );
    expect(
      productInputSchema.safeParse({ ...product, sellingPrice: "1.239" }).success,
    ).toBe(false);
    expect(productInputSchema.safeParse({ ...product, costPrice: "-0.01" }).success).toBe(
      false,
    );
    expect(
      productInputSchema.safeParse({ ...product, reorderLevel: "1.0001" }).success,
    ).toBe(false);
    expect(productInputSchema.safeParse({ ...product, categoryId: "" }).success).toBe(
      false,
    );
  });

  it("keeps money and quantities as canonical decimal strings", () => {
    expect(normalizeMoney("0012.3")).toBe("12.30");
    expect(normalizeMoney("0")).toBe("0.00");
    expect(normalizeQuantity("0004.250")).toBe("4.25");
    expect(normalizeQuantity("3.000")).toBe("3");
  });

  it("normalizes category labels into URL-safe slugs", () => {
    expect(normalizeSlug("  Frozen  Vegetables & Fruit ")).toBe(
      "frozen-vegetables-fruit",
    );
  });

  it("requires positive quantities and reasons for loss or correction movements", () => {
    const base = {
      productId: product.categoryId,
      quantity: "1.250",
      reason: "Counted on receiving",
    };
    expect(
      inventoryMovementInputSchema.safeParse({ ...base, movementType: "receipt" })
        .success,
    ).toBe(true);
    expect(
      inventoryMovementInputSchema.safeParse({
        ...base,
        movementType: "wastage",
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      inventoryMovementInputSchema.safeParse({
        ...base,
        movementType: "adjustment_out",
        quantity: "0",
      }).success,
    ).toBe(false);
    expect(
      inventoryMovementInputSchema.safeParse({
        ...base,
        movementType: "damage",
        quantity: "1.1234",
      }).success,
    ).toBe(false);
  });
});
