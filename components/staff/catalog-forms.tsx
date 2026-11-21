"use client";

import { useActionState } from "react";
import { saveCategory, saveProduct } from "@/app/(staff)/products/actions";
import type { Database } from "@/types/database";

type Category = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  "id" | "name" | "slug" | "is_active"
>;
type Product = Database["public"]["Tables"]["products"]["Row"];

const labelClass = "grid gap-1.5 text-sm font-medium text-[#153c33]";
const inputClass =
  "min-h-11 w-full rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm text-[#1f2924] outline-none placeholder:text-[#858d84] focus:border-[#2f654f] focus:ring-2 focus:ring-[#2f654f]/20";
const buttonClass =
  "min-h-11 rounded-lg bg-[#153c33] px-4 text-sm font-semibold text-white transition hover:bg-[#263b30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";

function ActionMessage({ state }: { state: { message?: string; success?: boolean } }) {
  if (!state.message) return null;
  return (
    <p
      role={state.success ? "status" : "alert"}
      className={`rounded-lg px-3 py-2 text-sm ${
        state.success ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
      }`}
    >
      {state.message}
    </p>
  );
}

export function CategoryForm({ category }: { category?: Category }) {
  const [state, formAction, pending] = useActionState(saveCategory, {});
  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-xl border border-[#d7e0d9] bg-[#f7f4ec] p-4 sm:grid-cols-2"
    >
      {category ? <input type="hidden" name="categoryId" value={category.id} /> : null}
      <label className={labelClass}>
        Category name
        <input
          className={inputClass}
          name="name"
          defaultValue={category?.name}
          required
          maxLength={100}
        />
      </label>
      <label className={labelClass}>
        Slug
        <input
          className={inputClass}
          name="slug"
          defaultValue={category?.slug}
          placeholder="frozen-vegetables"
          required
          maxLength={120}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
      </label>
      {category ? (
        <label className="flex min-h-11 items-center gap-2 text-sm text-[#153c33] sm:col-span-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={category.is_active}
            className="size-4 accent-[#153c33]"
          />
          Active category
        </label>
      ) : null}
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <ActionMessage state={state} />
        <button className={buttonClass} disabled={pending}>
          {pending ? "Saving…" : category ? "Save category" : "Add category"}
        </button>
      </div>
    </form>
  );
}

export function ProductForm({
  categories,
  product,
}: {
  categories: Category[];
  product?: Product;
}) {
  const [state, formAction, pending] = useActionState(saveProduct, {});
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <label className={labelClass}>
        Product name
        <input
          className={inputClass}
          name="name"
          defaultValue={product?.name}
          required
          maxLength={160}
        />
      </label>
      <label className={labelClass}>
        Category
        <select
          className={inputClass}
          name="categoryId"
          required
          defaultValue={product?.category_id ?? categories[0]?.id}
        >
          {categories.length === 0 ? (
            <option value="">Create an active category first</option>
          ) : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        SKU <span className="font-normal text-[#5e6b64]">Optional · unique</span>
        <input
          className={inputClass}
          name="sku"
          defaultValue={product?.sku ?? ""}
          maxLength={80}
        />
      </label>
      <label className={labelClass}>
        Barcode <span className="font-normal text-[#5e6b64]">Optional · unique</span>
        <input
          className={inputClass}
          name="barcode"
          defaultValue={product?.barcode ?? ""}
          maxLength={100}
          inputMode="numeric"
        />
      </label>
      <label className={labelClass}>
        Selling price (GHS)
        <input
          className={inputClass}
          name="sellingPrice"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={product ? String(product.selling_price) : ""}
          required
        />
      </label>
      <label className={labelClass}>
        Cost price (GHS) <span className="font-normal text-[#5e6b64]">Optional</span>
        <input
          className={inputClass}
          name="costPrice"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={
            product?.cost_price === null || !product ? "" : String(product.cost_price)
          }
        />
      </label>
      <label className={labelClass}>
        Low-stock threshold
        <input
          className={inputClass}
          name="reorderLevel"
          type="text"
          inputMode="decimal"
          placeholder="0.000"
          defaultValue={product ? String(product.reorder_level) : "0"}
          required
        />
        <span className="font-normal text-[#5e6b64]">Up to 3 decimal places</span>
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Description <span className="font-normal text-[#5e6b64]">Optional</span>
        <textarea
          className={`${inputClass} min-h-24 py-2.5`}
          name="description"
          defaultValue={product?.description ?? ""}
          maxLength={2000}
        />
      </label>
      {product ? (
        <label className="flex min-h-11 items-center gap-2 text-sm text-[#153c33] sm:col-span-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={product.is_active}
            className="size-4 accent-[#153c33]"
          />
          Active product
        </label>
      ) : null}
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <ActionMessage state={state} />
        <button className={buttonClass} disabled={pending || categories.length === 0}>
          {pending ? "Saving…" : product ? "Save product" : "Create product"}
        </button>
      </div>
    </form>
  );
}
