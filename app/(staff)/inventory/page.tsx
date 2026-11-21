import Link from "next/link";
import { randomUUID } from "node:crypto";
import { InventoryMovementForm } from "@/components/staff/inventory-movement-form";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { formatQuantity } from "@/lib/inventory/format";
import {
  getStockStatus,
  stockStatusLabels,
  stockStatusStyles,
} from "@/lib/inventory/stock-status";
import { createClient } from "@/lib/supabase/server";

export default async function InventoryPage() {
  await requireStaffContext();
  const client = await createClient();
  const [{ data: products, error: productsError }, { data: summary }, canViewHistory] =
    await Promise.all([
      client.rpc("search_products", {
        p_query: undefined,
        p_category_id: undefined,
        p_active: true,
        p_limit: 100,
        p_offset: 0,
      }),
      client.rpc("get_inventory_summary"),
      userHasPermission("view_stock_history"),
    ]);
  const permissionChecks = await Promise.all(
    [
      ["opening_stock", "initialize_inventory"],
      ["receipt", "receive_stock"],
      ["wastage", "record_wastage"],
      ["damage", "record_damage"],
      ["adjustment_in", "adjust_inventory"],
      ["adjustment_out", "adjust_inventory"],
    ].map(async ([movement, permission]) => ({
      movement,
      allowed: await userHasPermission(permission),
    })),
  );
  const allowedTypes = permissionChecks
    .filter((check) => check.allowed)
    .map((check) => check.movement) as Array<
    | "opening_stock"
    | "receipt"
    | "wastage"
    | "damage"
    | "adjustment_in"
    | "adjustment_out"
  >;

  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <StaffWorkspaceNav active="/inventory" canViewHistory={canViewHistory} />
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
            Stock control
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6b64]">
            Every stock change is recorded as an append-only movement. Current quantity
            cannot be typed over or silently reset.
          </p>
        </div>

        <section
          aria-label="Inventory summary"
          className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {[
            {
              label: "Active products",
              value: summary?.[0]?.active_products ?? 0,
              tone: "text-[#153c33]",
            },
            {
              label: "In stock",
              value: summary?.[0]?.in_stock ?? 0,
              tone: "text-emerald-800",
            },
            {
              label: "Low stock",
              value: summary?.[0]?.low_stock ?? 0,
              tone: "text-amber-900",
            },
            {
              label: "Out of stock",
              value: summary?.[0]?.out_of_stock ?? 0,
              tone: "text-rose-800",
            },
          ].map((stat) => (
            <article
              key={stat.label}
              className="rounded-xl border border-[#d7e0d9] bg-white p-4"
            >
              <p className="text-sm text-[#5e6b64]">{stat.label}</p>
              <p className={`mt-2 text-3xl font-semibold tabular-nums ${stat.tone}`}>
                {stat.value}
              </p>
            </article>
          ))}
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.8fr)]">
          <section className="rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Current stock</h2>
                <p className="mt-1 text-sm text-[#5e6b64]">
                  Quantity / reorder level · up to 3 decimal places
                </p>
              </div>
              {canViewHistory ? (
                <Link
                  href="/stock-movements"
                  className="text-sm font-semibold text-[#2f654f] hover:underline"
                >
                  View movement history →
                </Link>
              ) : null}
            </div>
            {productsError ? (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
              >
                Inventory could not be loaded. Refresh and try again.
              </p>
            ) : products?.length ? (
              <div className="overflow-x-auto rounded-xl border border-[#d7e0d9]">
                <table className="w-full min-w-[650px] border-collapse text-left text-sm">
                  <thead className="bg-[#f7f4ec] text-xs uppercase tracking-wide text-[#5e6b64]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Product</th>
                      <th className="px-4 py-3 font-semibold">SKU</th>
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Quantity / reorder
                      </th>
                      <th className="px-4 py-3 font-semibold">Stock status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eaf2f3]">
                    {products.map((product) => {
                      const status = getStockStatus(
                        product.quantity,
                        product.reorder_level,
                        product.is_active,
                      );
                      return (
                        <tr key={product.id}>
                          <td className="px-4 py-4">
                            <Link
                              href={`/stock-movements?productId=${product.id}`}
                              className="font-semibold text-[#153c33] underline-offset-4 hover:underline"
                            >
                              {product.name}
                            </Link>
                          </td>
                          <td className="px-4 py-4 font-mono text-xs text-[#5e6b64]">
                            {product.sku ?? "—"}
                          </td>
                          <td className="px-4 py-4 text-[#5e6b64]">
                            {product.category_name}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums">
                            {formatQuantity(product.quantity)}{" "}
                            <span className="text-[#5e6b64]">
                              / {formatQuantity(product.reorder_level)}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${stockStatusStyles[status]}`}
                            >
                              {stockStatusLabels[status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#d7e0d9] bg-[#f7f4ec] px-5 py-10 text-center">
                <p className="font-medium text-[#153c33]">No active products yet.</p>
                <p className="mt-1 text-sm text-[#5e6b64]">
                  Add products before recording stock.
                </p>
              </div>
            )}
            {(products?.length ?? 0) >= 100 ? (
              <p className="mt-3 text-xs text-[#5e6b64]">
                Showing the first 100 active products. Use the product catalogue to search
                the full list.
              </p>
            ) : null}
          </section>

          {allowedTypes.length > 0 ? (
            <section className="rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5e6b64]">
                Controlled update
              </p>
              <h2 className="mt-2 text-xl font-semibold">Record a stock movement</h2>
              <p className="mb-5 mt-1 text-sm leading-6 text-[#5e6b64]">
                Operations update the movement ledger and current balance together. A
                failed operation changes neither.
              </p>
              <InventoryMovementForm
                products={(products ?? []).map((product) => ({
                  id: product.id,
                  name: product.name,
                  sku: product.sku,
                  quantity: product.quantity,
                }))}
                allowedTypes={allowedTypes}
                operationId={randomUUID()}
              />
            </section>
          ) : (
            <section className="rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-6">
              <h2 className="text-xl font-semibold">Read-only inventory</h2>
              <p className="mt-2 text-sm leading-6 text-[#5e6b64]">
                Your current role can view stock but does not have an inventory update
                permission.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
