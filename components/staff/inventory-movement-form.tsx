"use client";

import { useState, useActionState } from "react";
import { recordStockMovement } from "@/app/(staff)/products/actions";
import type { Database } from "@/types/database";

type MovementType = Extract<
  Database["public"]["Enums"]["stock_movement_type"],
  "opening_stock" | "receipt" | "wastage" | "damage" | "adjustment_in" | "adjustment_out"
>;
type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  quantity: number | null;
};

const descriptions: Record<MovementType, string> = {
  opening_stock:
    "Set the first recorded quantity for a product. Later corrections use adjustments.",
  receipt:
    "Add units received into the store. Supplier purchasing is not part of this workflow.",
  wastage: "Remove stock that was wasted or expired. A reason is required.",
  damage: "Remove stock that was damaged. A reason is required.",
  adjustment_in: "Record a reasoned positive count correction.",
  adjustment_out: "Record a reasoned negative count correction.",
};

const options: Array<{ value: MovementType; label: string }> = [
  { value: "opening_stock", label: "Opening stock" },
  { value: "receipt", label: "Stock received" },
  { value: "wastage", label: "Wastage" },
  { value: "damage", label: "Damage" },
  { value: "adjustment_in", label: "Adjustment in" },
  { value: "adjustment_out", label: "Adjustment out" },
];

const inputClass =
  "min-h-11 w-full rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm outline-none focus:border-[#2f654f] focus:ring-2 focus:ring-[#2f654f]/20";

export function InventoryMovementForm({
  products,
  allowedTypes,
  operationId,
}: {
  products: ProductOption[];
  allowedTypes: MovementType[];
  operationId: string;
}) {
  const [state, formAction, pending] = useActionState(recordStockMovement, {});
  const firstType = allowedTypes[0] ?? "receipt";
  const [movementType, setMovementType] = useState<MovementType>(firstType);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const opening = movementType === "opening_stock";
  const needsReason = ["wastage", "damage", "adjustment_in", "adjustment_out"].includes(
    movementType,
  );
  const productOptions = opening
    ? products.filter((product) => product.quantity === null)
    : products;
  const selectedProduct = productOptions.some((product) => product.id === productId)
    ? productId
    : (productOptions[0]?.id ?? "");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="operationId" value={operationId} />
      <label className="grid gap-1.5 text-sm font-medium text-[#153c33]">
        Stock operation
        <select
          className={inputClass}
          name="movementType"
          value={movementType}
          onChange={(event) => setMovementType(event.target.value as MovementType)}
        >
          {options
            .filter((option) => allowedTypes.includes(option.value))
            .map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        </select>
        <span className="font-normal text-[#5e6b64]">{descriptions[movementType]}</span>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#153c33]">
        Product
        <select
          className={inputClass}
          name="productId"
          value={selectedProduct}
          onChange={(event) => setProductId(event.target.value)}
          required
        >
          {productOptions.length === 0 ? (
            <option value="">No uninitialized product remains</option>
          ) : null}
          {productOptions.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.sku ? ` · ${product.sku}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#153c33]">
        Quantity
        <input
          className={inputClass}
          name="quantity"
          type="text"
          inputMode="decimal"
          placeholder="0.000"
          required
          pattern="\d{1,9}(\.\d{1,3})?"
        />
        <span className="font-normal text-[#5e6b64]">
          Enter a positive amount; the operation controls whether stock goes in or out. Up
          to 3 decimal places.
        </span>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#153c33]">
        Reason{" "}
        {needsReason ? (
          <span className="text-rose-800">· required</span>
        ) : (
          <span className="font-normal text-[#5e6b64]">· optional</span>
        )}
        <textarea
          className={`${inputClass} min-h-20 py-2.5`}
          name="reason"
          required={needsReason}
          maxLength={1000}
          placeholder={needsReason ? "Explain why this stock changed" : "Optional note"}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#153c33]">
        Reference <span className="font-normal text-[#5e6b64]">· optional</span>
        <input
          className={inputClass}
          name="reference"
          maxLength={80}
          placeholder="Delivery note or internal reference"
        />
      </label>
      {state.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className={`rounded-lg px-3 py-2 text-sm ${state.success ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
        >
          {state.message}
        </p>
      ) : null}
      <button
        className="min-h-11 w-full rounded-lg bg-[#153c33] px-4 text-sm font-semibold text-white transition hover:bg-[#263b30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pending || productOptions.length === 0}
      >
        {pending ? "Recording…" : "Record movement"}
      </button>
    </form>
  );
}
